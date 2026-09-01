import { formatCents } from "@/lib/money";
import { MAX_LEVEL, xpToNext } from "@/lib/progression";
import { REP_TIERS, nextTier, tierFor } from "@/lib/life/reputation";
import { nextVip, vipFor, vipProgress } from "@/lib/life/vip";
import { VENUES, doorCheck, travelCostCents } from "@/lib/life/venues";
import { ACHIEVEMENTS, type StatSnapshot } from "@/lib/life/achievements";

/**
 * WINIT — WHAT'S NEXT
 * ---------------------------------------------------------------------------
 * A career with this many tracks running at once is only motivating if the
 * game can answer "what am I working toward" in one line. This module does
 * exactly that: it collects every open goal across levels, reputation, VIP,
 * the circuit and the achievement list, scores each by how close it is, and
 * hands back the nearest few.
 *
 * Everything here is derived from the same snapshot the achievements are
 * evaluated against, so a goal can never claim progress the rest of the app
 * disagrees with.
 * ---------------------------------------------------------------------------
 */

export type GoalKind = "level" | "reputation" | "vip" | "venue" | "achievement";

export type Goal = {
  kind: GoalKind;
  title: string;
  detail: string;
  /** 0..1 */
  progress: number;
  /** Where to send the player to work on it. */
  href: string;
};

export type GoalInput = {
  snapshot: StatSnapshot;
  xp: number;
  unlocked: Set<string>;
};

export function nextGoals({ snapshot, xp, unlocked }: GoalInput, limit = 4): Goal[] {
  const goals: Goal[] = [];

  // --- the ladder ---------------------------------------------------------
  if (snapshot.level < MAX_LEVEL) {
    const need = xpToNext(snapshot.level);
    goals.push({
      kind: "level",
      title: `Reach level ${snapshot.level + 1}`,
      detail: `${Math.max(0, need - xp).toLocaleString()} XP to go`,
      progress: need === 0 ? 1 : Math.min(1, xp / need),
      href: "/life",
    });
  }

  // --- reputation ---------------------------------------------------------
  const rep = tierFor(snapshot.reputation);
  const repNext = nextTier(snapshot.reputation);
  if (repNext) {
    goals.push({
      kind: "reputation",
      title: `Become ${repNext.name}`,
      detail: `${(repNext.from - snapshot.reputation).toLocaleString()} reputation to go`,
      progress: (snapshot.reputation - rep.from) / (repNext.from - rep.from),
      href: "/life",
    });
  }

  // --- VIP ----------------------------------------------------------------
  const vipNext = nextVip(snapshot.lifetimeWageredCents);
  if (vipNext) {
    goals.push({
      kind: "vip",
      title: `Reach ${vipNext.name} VIP`,
      detail: `${formatCents(vipNext.from - snapshot.lifetimeWageredCents)} more staked`,
      progress: vipProgress(snapshot.lifetimeWageredCents),
      href: "/life",
    });
  }

  // --- the circuit --------------------------------------------------------
  // The nearest room the player cannot get into yet.
  const shut = VENUES.filter((v) => !doorCheck(v, snapshot.level, snapshot.balanceCents).open);
  if (shut.length > 0) {
    const target = shut[0];
    const levelPart = Math.min(1, snapshot.level / target.minLevel);
    const bankPart =
      target.minBankrollCents === 0 ? 1 : Math.min(1, snapshot.balanceCents / target.minBankrollCents);
    goals.push({
      kind: "venue",
      title: `Get into ${target.name}`,
      detail:
        snapshot.level < target.minLevel
          ? `Level ${target.minLevel} needed — you are ${snapshot.level}`
          : `${formatCents(target.minBankrollCents)} bankroll needed`,
      progress: Math.min(levelPart, bankPart),
      href: "/life",
    });
  }

  // --- the closest achievement -------------------------------------------
  const closest = ACHIEVEMENTS.filter((a) => !unlocked.has(a.key) && !a.secret && a.progress)
    .map((a) => ({ a, p: a.progress!(snapshot) }))
    .filter((x) => x.p > 0 && x.p < 1)
    .sort((x, y) => y.p - x.p)[0];

  if (closest) {
    goals.push({
      kind: "achievement",
      title: closest.a.name,
      detail: closest.a.description,
      progress: closest.p,
      href: "/achievements",
    });
  }

  // Nearest first — the thing you are most likely to finish next is the thing
  // most worth showing.
  return goals.sort((a, b) => b.progress - a.progress).slice(0, limit);
}

export { REP_TIERS, vipFor, travelCostCents };
