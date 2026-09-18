import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadShareableWin } from "@/lib/share";
import { pageMetadata } from "@/lib/metadata";
import { GAME_LABELS } from "@/lib/gameLabels";
import { formatCents } from "@/lib/money";
import { Wordmark } from "@/components/Wordmark";
import ShareButton from "@/components/ShareButton";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const win = await loadShareableWin(params.id);
  if (!win) return { title: "Win not found" };
  const label = GAME_LABELS[win.game] ?? win.game;
  return pageMetadata(
    `${win.username} won ${formatCents(win.netCents)} on ${label}`,
    `${win.summary} — played on WinIt, a play-money casino. No deposits, no withdrawals, just the games.`,
  );
}

/**
 * A public win card — the page a shared link actually opens to, matching the
 * image a platform renders for the link preview from the sibling
 * opengraph-image route. No sign-in needed to view someone else's; this page
 * shows exactly one already-settled bet and nothing else about the account.
 */
export default async function SharePage({ params }: { params: { id: string } }) {
  const win = await loadShareableWin(params.id);
  if (!win) notFound();

  const label = GAME_LABELS[win.game] ?? win.game;
  const multiplier = win.betCents > 0 ? win.payoutCents / win.betCents : 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-900 px-4 py-12">
      <div className="w-full max-w-md text-center">
        <Link href="/" className="mb-8 inline-flex justify-center">
          <Wordmark />
        </Link>

        <div className="panel overflow-hidden p-0">
          <div className="border-b border-white/5 bg-gradient-to-b from-win/10 to-transparent p-8">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-win">Winner</p>
            <p className="num mt-2 text-5xl font-black text-white">+{formatCents(win.netCents)}</p>
            <p className="num mt-1 text-lg font-bold text-win">×{multiplier.toFixed(2)}</p>
          </div>
          <div className="p-6">
            <p className="text-[13px] font-bold text-slate-200">
              <span className="text-volt">{win.username}</span> on {label}
            </p>
            <p className="mt-1 text-[12px] text-slate-500">{win.summary}</p>
            <p className="num mt-3 text-[11px] text-slate-600">
              Staked {formatCents(win.betCents)} · paid {formatCents(win.payoutCents)}
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-1">
          <p className="text-[12px] text-slate-500">
            WinIt is a play-money casino — no deposits, no withdrawals, just the games.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link href="/signup" className="btn-primary mt-2 inline-flex px-6 py-2.5 text-sm">
              Play free
            </Link>
            <ShareButton
              title="I just won on WinIt"
              text={`${win.username} won ${formatCents(win.netCents)} on ${label} — WinIt is a play-money casino.`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
