import type { Prisma } from "@prisma/client";
import { fromDb, toDb } from "@/lib/bigmoney";
import { formatCents } from "@/lib/money";
import { randomFloat, randomInt } from "@/lib/rng";
import { venueById } from "@/lib/life/venues";
import { REP_TIERS, repForWager, tierFor, type RepTier } from "@/lib/life/reputation";
import { vipFor, type VipTier } from "@/lib/life/vip";
import { ACHIEVEMENTS, newlyEarned, type Achievement, type StatSnapshot } from "@/lib/life/achievements";
import {
  boardFor,
  periodKey,
  targetFor,
  type ChallengeDef,
  type Period,
} from "@/lib/life/challenges";
import {
  EVENT_CHANCE_PER_BET,
  MAX_EVENTS_PER_DAY,
  centsFor,
  eligible,
  type EventContext,
  type EventDef,
} from "@/lib/life/events";
import { ageFromDays } from "@/lib/life/career";

/**
 * WINIT — THE PROGRESSION PASS
 * ---------------------------------------------------------------------------
 * Everything that happens to a career BECAUSE a bet settled, in one place:
 * per-game counters, reputation, VIP, achievements, challenge progress and the
 * random-event roll.
 *
 * It runs inside the same database transaction as the settlement itself, so a
 * bet either updates all of this or none of it — a crash halfway through can
 * never leave an achievement unlocked for a bet that did not happen.
 *
 * The ledger primitives are passed IN rather than imported. ledger.ts calls
 * this, so importing them back would be a cycle; taking them as arguments
 * makes the dependency one-way and explicit.
 * ---------------------------------------------------------------------------
 */

type Tx = Prisma.TransactionClient;

export type LedgerOps = {
  credit: (tx: Tx, userId: string, cents: number) => Promise<number>;
  debit: (tx: Tx, userId: string, cents: number) => Promise<number>;
  writeTransaction: (tx: Tx, input: {
    userId: string;
    game: string;
    kind: "BET" | "BONUS" | "SIGNUP" | "LEVELUP" | "REBIRTH" | "COMEBACK" | "DEATH" | "TRAVEL" | "NEWLIFE" | "EVENT" | "CHALLENGE";
    betCents: number;
    payoutCents: number;
    outcome: "WIN" | "LOSS" | "PUSH" | "CREDIT";
    summary: string;
    balanceAfterCents: number;
    detail?: unknown;
  }) => Promise<unknown>;
};

export type AchievementAward = {
  key: string;
  name: string;
  description: string;
  tier: Achievement["tier"];
  category: Achievement["category"];
};

export type ChallengeDone = {
  key: string;
  name: string;
  period: Period;
  target: number;
};

export type PendingEventView = {
  id: string;
  key: string;
  title: string;
  body: string;
  rarity: EventDef["rarity"];
  choices: { key: string; label: string }[];
};

export type ResolvedEventView = {
  id: string;
  key: string;
  title: string;
  body: string;
  rarity: EventDef["rarity"];
  outcomeText: string;
  netCents: number;
  reputationDelta: number;
  daysDelta: number;
};

export type ProgressionExtras = {
  reputation: number;
  reputationGained: number;
  repTier: RepTier;
  repTierUp: RepTier | null;
  vip: VipTier;
  vipPromotion: VipTier | null;
  achievements: AchievementAward[];
  challengesCompleted: ChallengeDone[];
  /** A choice event waiting on the player. */
  pendingEvent: PendingEventView | null;
  /** An event that simply happened, already applied. */
  resolvedEvent: ResolvedEventView | null;
};

export type AdvanceInput = {
  userId: string;
  game: string;
  wagerCents: number;
  payoutCents: number;
  /** Post-settlement values, already computed by the caller. */
  level: number;
  rebirths: number;
  livesLived: number;
  lifetimeWageredCents: number;
  lifetimeWonCents: number;
  biggestWinCents: number;
  bestMultiplierX100: number;
  betsThisLife: number;
  careerDays: number;
  balanceCents: number;
  peakBalanceCents: number;
  comebacksUsed: number;
  venueId: string;
  maxBetCents: number;
  /** Lifetime wagered BEFORE this bet, for detecting a VIP promotion. */
  lifetimeWageredBefore: number;
  reputationBefore: number;
  visitedVenuesJson: string;
  eventsToday: number;
  eventDayKey: string;
  /** Set when the career ended on this bet — no events fire into a dead career. */
  careerOver: boolean;
};

/** UTC day key, matching the challenge module's daily key. */
function dayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function applyProgression(
  tx: Tx,
  input: AdvanceInput,
  ledger: LedgerOps,
): Promise<ProgressionExtras> {
  const {
    userId,
    game,
    wagerCents,
    payoutCents,
    maxBetCents,
    venueId,
  } = input;

  const won = payoutCents > wagerCents;
  const multiplierX100 = wagerCents > 0 ? Math.round((payoutCents / wagerCents) * 100) : 0;

  // --- per-game counters ---------------------------------------------------
  const existingStat = await tx.gameStat.findUnique({
    where: { userId_game: { userId, game } },
  });
  await tx.gameStat.upsert({
    where: { userId_game: { userId, game } },
    create: {
      userId,
      game,
      bets: 1,
      wins: won ? 1 : 0,
      wageredCents: toDb(wagerCents),
      wonCents: toDb(payoutCents),
      biggestWinCents: toDb(payoutCents),
      bestMultiplierX100: multiplierX100,
    },
    update: {
      bets: { increment: 1 },
      wins: won ? { increment: 1 } : undefined,
      wageredCents: { increment: toDb(wagerCents) },
      wonCents: { increment: toDb(payoutCents) },
      biggestWinCents: toDb(Math.max(fromDb(existingStat?.biggestWinCents ?? 0n), payoutCents)),
      bestMultiplierX100: Math.max(existingStat?.bestMultiplierX100 ?? 0, multiplierX100),
    },
  });

  // --- reputation and venue history ---------------------------------------
  const venue = venueById(venueId);
  // A room's reputation weight rises with how much of your limit its floor
  // demands — the back room is worth almost nothing, The Vault is worth a lot.
  const venueWeight = 1 + venue.tableMinFraction * 8;
  const reputationGained = repForWager(wagerCents, maxBetCents, venueWeight);
  const reputation = Math.max(0, input.reputationBefore + reputationGained);

  let visited: string[];
  try {
    const parsed = JSON.parse(input.visitedVenuesJson);
    visited = Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    visited = [];
  }
  if (!visited.includes(venueId)) visited = [...visited, venueId];

  await tx.user.update({
    where: { id: userId },
    data: { reputation, visitedVenuesJson: JSON.stringify(visited) },
  });

  const repTierBefore = tierFor(input.reputationBefore);
  const repTier = tierFor(reputation);
  const repTierUp = repTier.from > repTierBefore.from ? repTier : null;

  const vipBefore = vipFor(input.lifetimeWageredBefore);
  const vip = vipFor(input.lifetimeWageredCents);
  const vipPromotion = vip.level > vipBefore.level ? vip : null;

  // --- achievements --------------------------------------------------------
  const stats = await tx.gameStat.findMany({ where: { userId } });
  const games: StatSnapshot["games"] = {};
  for (const s of stats) {
    games[s.game] = {
      bets: s.bets,
      wins: s.wins,
      wageredCents: fromDb(s.wageredCents),
      biggestWinCents: fromDb(s.biggestWinCents),
    };
  }

  const snapshot: StatSnapshot = {
    level: input.level,
    rebirths: input.rebirths,
    livesLived: input.livesLived,
    reputation,
    repTierIndex: REP_TIERS.indexOf(repTier),
    vipLevel: vip.level,
    lifetimeWageredCents: input.lifetimeWageredCents,
    lifetimeWonCents: input.lifetimeWonCents,
    biggestWinCents: input.biggestWinCents,
    bestMultiplier: input.bestMultiplierX100 / 100,
    betsThisLife: input.betsThisLife,
    careerDays: input.careerDays,
    age: ageFromDays(input.careerDays),
    balanceCents: input.balanceCents,
    peakBalanceCents: input.peakBalanceCents,
    comebacksUsed: input.comebacksUsed,
    venueId,
    venuesVisited: visited,
    games,
    distinctGamesPlayed: stats.length,
    distinctGamesWon: stats.filter((s) => s.wins > 0).length,
  };

  const already = new Set(
    (await tx.achievementUnlock.findMany({ where: { userId }, select: { key: true } })).map((a) => a.key),
  );
  const earned = newlyEarned(snapshot, already);
  const achievements: AchievementAward[] = [];
  for (const a of earned) {
    await tx.achievementUnlock.create({ data: { userId, key: a.key } });
    achievements.push({
      key: a.key,
      name: a.name,
      description: a.description,
      tier: a.tier,
      category: a.category,
    });
  }

  // --- challenges ----------------------------------------------------------
  const challengesCompleted: ChallengeDone[] = [];
  for (const period of ["daily", "weekly"] as Period[]) {
    const pKey = periodKey(period);
    for (const def of boardFor(period, pKey)) {
      const target = targetFor(def, period);
      const row = await tx.challengeProgress.upsert({
        where: {
          userId_key_period_periodKey: { userId, key: def.key, period, periodKey: pKey },
        },
        create: { userId, key: def.key, period, periodKey: pKey, target, progress: 0 },
        update: {},
      });
      if (row.progress >= target) continue; // already done; claiming is separate

      const { delta, seenJson } = advanceMetric(def, row.seenJson, game, wagerCents, won, multiplierX100);
      if (delta === 0 && seenJson === row.seenJson) continue;

      const progress = Math.min(target, row.progress + delta);
      await tx.challengeProgress.update({
        where: { id: row.id },
        data: { progress, seenJson },
      });

      if (progress >= target) {
        challengesCompleted.push({ key: def.key, name: def.name, period, target });
      }
    }
  }

  // --- random event --------------------------------------------------------
  const extras: ProgressionExtras = {
    reputation,
    reputationGained,
    repTier,
    repTierUp,
    vip,
    vipPromotion,
    achievements,
    challengesCompleted,
    pendingEvent: null,
    resolvedEvent: null,
  };

  if (input.careerOver) return extras;

  const today = dayKey();
  const eventsToday = input.eventDayKey === today ? input.eventsToday : 0;
  if (eventsToday >= MAX_EVENTS_PER_DAY) return extras;

  // Never stack events — one decision at a time.
  const outstanding = await tx.lifeEvent.findFirst({ where: { userId, status: "PENDING" } });
  if (outstanding) return extras;

  if (randomFloat() >= EVENT_CHANCE_PER_BET) return extras;

  const ctx: EventContext = {
    level: input.level,
    reputation,
    repTierIndex: REP_TIERS.indexOf(repTier),
    vipLevel: vip.level,
    balanceCents: input.balanceCents,
    limitCents: maxBetCents,
    venueId,
    age: ageFromDays(input.careerDays),
    betsThisLife: input.betsThisLife,
    comebacksUsed: input.comebacksUsed,
    livesLived: input.livesLived,
    rebirths: input.rebirths,
  };

  const pool = eligible(ctx);
  if (pool.length === 0) return extras;

  const totalWeight = pool.reduce((sum, e) => sum + e.weight, 0);
  let roll = randomInt(totalWeight);
  let chosen = pool[pool.length - 1];
  for (const e of pool) {
    roll -= e.weight;
    if (roll < 0) {
      chosen = e;
      break;
    }
  }

  await tx.user.update({
    where: { id: userId },
    data: { eventsToday: eventsToday + 1, eventDayKey: today },
  });

  if (chosen.choices && chosen.choices.length > 0) {
    const row = await tx.lifeEvent.create({
      data: { userId, key: chosen.key, status: "PENDING", stakeCents: toDb(wagerCents) },
    });
    extras.pendingEvent = {
      id: row.id,
      key: chosen.key,
      title: chosen.title,
      body: chosen.body,
      rarity: chosen.rarity,
      choices: chosen.choices.map((c) => ({ key: c.key, label: c.label })),
    };
    return extras;
  }

  // An instant event: apply it here and now.
  const effect = chosen.instant ?? { text: "Nothing much came of it." };
  // Capped against the stake that triggered it as well as the table limit.
  const cents = centsFor(effect, maxBetCents, wagerCents);
  const applied = await applyEffectMoney(tx, userId, cents, chosen, effect.text, ledger);

  const repDelta = effect.reputation ?? 0;
  const daysDelta = effect.days ?? 0;
  if (repDelta !== 0 || daysDelta !== 0) {
    await tx.user.update({
      where: { id: userId },
      data: {
        reputation: Math.max(0, reputation + repDelta),
        careerDays: { increment: daysDelta },
      },
    });
    extras.reputation = Math.max(0, reputation + repDelta);
    extras.repTier = tierFor(extras.reputation);
  }

  const row = await tx.lifeEvent.create({
    data: {
      userId,
      key: chosen.key,
      status: "RESOLVED",
      stakeCents: toDb(wagerCents),
      outcomeText: effect.text,
      netCents: toDb(cents),
      reputationDelta: repDelta,
      daysDelta,
      resolvedAt: new Date(),
    },
  });

  extras.resolvedEvent = {
    id: row.id,
    key: chosen.key,
    title: chosen.title,
    body: chosen.body,
    rarity: chosen.rarity,
    outcomeText: effect.text,
    netCents: cents,
    reputationDelta: repDelta,
    daysDelta,
  };
  void applied;

  return extras;
}

/**
 * Moves money for an event through the ledger. Nothing here writes a balance
 * directly: a gain is a credit and a loss is a debit, each with its own
 * Transaction row, so the running-balance chain stays exact.
 *
 * A loss is clamped to what the player actually has — an event must never be
 * able to drive a balance negative, which is the one thing the debit guard
 * would throw on.
 */
async function applyEffectMoney(
  tx: Tx,
  userId: string,
  cents: number,
  def: EventDef,
  text: string,
  ledger: LedgerOps,
): Promise<number> {
  if (cents === 0) return 0;

  const current = fromDb(
    (await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { balanceCents: true } })).balanceCents,
  );

  if (cents > 0) {
    const after = await ledger.credit(tx, userId, cents);
    await ledger.writeTransaction(tx, {
      userId,
      game: "life",
      kind: "EVENT",
      betCents: 0,
      payoutCents: cents,
      outcome: "CREDIT",
      summary: `${def.title} — ${text} (+${formatCents(cents)})`,
      balanceAfterCents: after,
      detail: { event: def.key, rarity: def.rarity, cents },
    });
    return cents;
  }

  const cost = Math.min(current, -cents);
  if (cost === 0) return 0;
  const after = await ledger.debit(tx, userId, cost);
  await ledger.writeTransaction(tx, {
    userId,
    game: "life",
    kind: "EVENT",
    betCents: cost,
    payoutCents: 0,
    outcome: "LOSS",
    summary: `${def.title} — ${text} (-${formatCents(cost)})`,
    balanceAfterCents: after,
    detail: { event: def.key, rarity: def.rarity, cents: -cost },
  });
  return -cost;
}

/** How one settled bet moves a single challenge forward. */
function advanceMetric(
  def: ChallengeDef,
  seenJson: string,
  game: string,
  wagerCents: number,
  won: boolean,
  multiplierX100: number,
): { delta: number; seenJson: string } {
  switch (def.metric.type) {
    case "BETS":
      return { delta: 1, seenJson };
    case "WAGERED":
      return { delta: wagerCents, seenJson };
    case "WINS":
      return { delta: won ? 1 : 0, seenJson };
    case "GAME_BETS":
      return { delta: def.metric.game === game ? 1 : 0, seenJson };
    case "MULTIPLIER_AT_LEAST":
      return { delta: multiplierX100 >= def.metric.multiplier * 100 ? 1 : 0, seenJson };
    case "DISTINCT_GAMES": {
      let seen: string[];
      try {
        const parsed = JSON.parse(seenJson);
        seen = Array.isArray(parsed) ? (parsed as string[]) : [];
      } catch {
        seen = [];
      }
      if (seen.includes(game)) return { delta: 0, seenJson };
      seen.push(game);
      return { delta: 1, seenJson: JSON.stringify(seen) };
    }
  }
}

export { ACHIEVEMENTS };
