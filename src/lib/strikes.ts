import type { Prisma } from "@prisma/client";

/** Strikes that suspend the account. */
export const STRIKES_TO_SUSPEND = 3;

/** Strikes that ban it outright — one more after the suspension. */
export const STRIKES_TO_BAN = 4;

export type StrikeOutcome = "WARNED" | "SUSPENDED" | "BANNED";

type Tx = Prisma.TransactionClient;

/**
 * Records one infraction against an account and applies whatever it earns.
 *
 * Strikes are cumulative and do not expire: three suspends the account, a
 * fourth bans it. The Strike rows are append-only, so the counter on the user
 * is always reproducible from them, and staff can see exactly what happened
 * rather than an unexplained suspension.
 *
 * The player is told, through the same inbox staff announcements use — an
 * account that goes quiet with no explanation is a support ticket waiting to
 * happen.
 */
export async function addStrike(
  tx: Tx,
  userId: string,
  input: { kind: string; reason: string; detail?: string },
): Promise<{ strikes: number; outcome: StrikeOutcome }> {
  const user = await tx.user.update({
    where: { id: userId },
    data: { strikes: { increment: 1 } },
    select: { strikes: true, username: true },
  });

  const strikes = user.strikes;
  const outcome: StrikeOutcome =
    strikes >= STRIKES_TO_BAN ? "BANNED" : strikes >= STRIKES_TO_SUSPEND ? "SUSPENDED" : "WARNED";

  if (outcome === "BANNED") {
    await tx.user.update({
      where: { id: userId },
      data: {
        bannedAt: new Date(),
        bannedReason: input.reason,
        suspendedAt: new Date(),
        suspendedReason: input.reason,
      },
    });
  } else if (outcome === "SUSPENDED") {
    await tx.user.update({
      where: { id: userId },
      data: { suspendedAt: new Date(), suspendedReason: input.reason },
    });
  }

  await tx.strike.create({
    data: { userId, kind: input.kind, reason: input.reason, outcome, detail: input.detail ?? null },
  });

  await tx.announcement.create({
    data: {
      title:
        outcome === "BANNED"
          ? "Your account has been banned"
          : outcome === "SUSPENDED"
            ? "Your account has been suspended"
            : `Warning — strike ${strikes} of ${STRIKES_TO_SUSPEND}`,
      body:
        outcome === "BANNED"
          ? `${input.reason} This was your ${strikes}th strike, so the account is banned.`
          : outcome === "SUSPENDED"
            ? `${input.reason} That is ${strikes} strikes, so the account is suspended. One more and it will be banned.`
            : `${input.reason} That is strike ${strikes} of ${STRIKES_TO_SUSPEND}. At ${STRIKES_TO_SUSPEND} the account is suspended.`,
      level: "WARNING",
      targetId: userId,
      createdById: userId,
      createdBy: "system",
    },
  });

  return { strikes, outcome };
}
