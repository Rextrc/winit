"use client";

import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import { END_AGE } from "@/lib/life/career";

/**
 * The end of a career, raised the moment the bet that finished it settles.
 *
 * Deliberately unskippable-looking but entirely dismissible: nothing about the
 * account changes when this closes, because the death already happened
 * server-side inside the same transaction that settled the bet. This is the
 * notification, not the mechanism.
 */
export default function DeathOverlay() {
  const { death, dismissDeath } = useWallet();
  if (!death) return null;

  const ruin = death.cause === "RUIN";

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/85 p-4 backdrop-blur-sm">
      <div className="animate-banner-in panel w-full max-w-md overflow-hidden border-white/10 text-center">
        <div
          className={`border-b border-white/5 p-8 ${
            ruin ? "bg-gradient-to-b from-loss/15 to-transparent" : "bg-gradient-to-b from-volt/15 to-transparent"
          }`}
        >
          <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-500">
            {ruin ? "Ruined" : "Time called"}
          </p>
          <h2 className="font-display mt-2 text-4xl font-black tracking-tight text-white">
            {ruin ? "You are finished." : `You made it to ${END_AGE}.`}
          </h2>
          <p className="num mt-1 text-sm text-slate-400">Age {death.ageAtEnd}</p>
          <p className="mt-4 text-[13px] italic leading-relaxed text-slate-300">
            &ldquo;{death.epitaph}&rdquo;
          </p>
        </div>

        <div className="space-y-3 p-6">
          <p className="text-[12px] leading-relaxed text-slate-400">
            {ruin
              ? "Out of money and out of comebacks. No room on the circuit will deal to you."
              : "The clock ran out. Whatever is left on the table stays on the table."}{" "}
            Your career is over — the tables are closed until someone new sits down.
          </p>
          <Link href="/life" onClick={dismissDeath} className="btn-primary w-full py-2.5">
            Read the obituary, then start again
          </Link>
          <button type="button" onClick={dismissDeath} className="btn-ghost w-full py-2 text-xs">
            Not yet
          </button>
        </div>
      </div>
    </div>
  );
}
