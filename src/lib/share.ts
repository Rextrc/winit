import { prisma } from "@/lib/prisma";
import { fromDb } from "@/lib/bigmoney";

export type ShareableWin = {
  id: string;
  username: string;
  game: string;
  summary: string;
  betCents: number;
  payoutCents: number;
  netCents: number;
  createdAt: Date;
};

/**
 * Loads a transaction for the public share page and its OG image — the same
 * lookup both use, so a link that renders can never disagree with the card a
 * platform generated for it.
 *
 * Deliberately public (no session check): a share link is meant to be opened
 * by someone who is not signed in and does not need to be. What it exposes is
 * narrow on purpose — only a settled, winning bet, and only the fields the
 * player is already choosing to broadcast by sharing it (game, result,
 * amount, their own username). No balance, no email, no other transaction.
 * The id is a cuid, effectively unguessable, so possession of the exact link
 * is the access control.
 */
export async function loadShareableWin(id: string): Promise<ShareableWin | null> {
  const row = await prisma.transaction.findUnique({
    where: { id },
    select: {
      id: true,
      game: true,
      kind: true,
      summary: true,
      betCents: true,
      payoutCents: true,
      netCents: true,
      createdAt: true,
      user: { select: { username: true } },
    },
  });
  if (!row || row.kind !== "BET") return null;
  const netCents = fromDb(row.netCents);
  if (netCents <= 0) return null;

  return {
    id: row.id,
    username: row.user.username,
    game: row.game,
    summary: row.summary,
    betCents: fromDb(row.betCents),
    payoutCents: fromDb(row.payoutCents),
    netCents,
    createdAt: row.createdAt,
  };
}
