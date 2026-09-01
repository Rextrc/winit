"use client";

import { useCallback, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { RARITY_COLOURS, RARITY_LABELS } from "@/lib/life/events";
import { formatCents, formatSignedCents } from "@/lib/money";

type Outcome = {
  title: string;
  choiceLabel: string;
  outcomeText: string;
  netCents: number;
  reputationDelta: number;
  daysDelta: number;
  rarity: keyof typeof RARITY_COLOURS;
};

/**
 * The decision moment. The options come from the server, and so does the
 * outcome — this component sends only which button was pressed. Nothing about
 * what happens is computed here, so a modified client can pick a different
 * option but never a different result.
 */
export default function EventModal() {
  const { pendingEvent, clearPendingEvent, refresh } = useWallet();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = useCallback(
    async (choiceKey: string) => {
      if (!pendingEvent || busy) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/life/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId: pendingEvent.id, choiceKey }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "That didn't work.");
          return;
        }
        setOutcome({ ...data.outcome, rarity: pendingEvent.rarity });
        await refresh();
      } catch {
        setError("Network error — nothing was decided.");
      } finally {
        setBusy(false);
      }
    },
    [pendingEvent, busy, refresh],
  );

  const close = useCallback(() => {
    setOutcome(null);
    setError(null);
    clearPendingEvent();
  }, [clearPendingEvent]);

  if (!pendingEvent) return null;

  const colour = RARITY_COLOURS[pendingEvent.rarity];

  return (
    <div className="fixed inset-0 z-[95] grid place-items-center bg-black/85 p-4 backdrop-blur-sm">
      <div className="animate-banner-in panel w-full max-w-md overflow-hidden border-white/10">
        <div
          className="border-b border-white/5 p-6"
          style={{ background: `linear-gradient(180deg, ${colour}22, transparent)` }}
        >
          <p
            className="text-[10px] font-black uppercase tracking-[0.24em]"
            style={{ color: colour }}
          >
            {RARITY_LABELS[pendingEvent.rarity]}
          </p>
          <h2 className="font-display mt-2 text-2xl font-black tracking-tight text-white">
            {pendingEvent.title}
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-300">{pendingEvent.body}</p>
        </div>

        {outcome ? (
          <div className="space-y-4 p-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                You chose
              </p>
              <p className="text-[13px] font-bold text-slate-100">{outcome.choiceLabel}</p>
            </div>

            <p className="text-[13px] italic leading-relaxed text-slate-300">
              &ldquo;{outcome.outcomeText}&rdquo;
            </p>

            <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-4 text-center">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Money</p>
                <p
                  className={`num text-[13px] font-black ${
                    outcome.netCents > 0 ? "text-win" : outcome.netCents < 0 ? "text-loss" : "text-slate-400"
                  }`}
                >
                  {outcome.netCents === 0 ? "—" : formatSignedCents(outcome.netCents)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Reputation</p>
                <p
                  className={`num text-[13px] font-black ${
                    outcome.reputationDelta > 0
                      ? "text-volt"
                      : outcome.reputationDelta < 0
                        ? "text-loss"
                        : "text-slate-400"
                  }`}
                >
                  {outcome.reputationDelta === 0
                    ? "—"
                    : `${outcome.reputationDelta > 0 ? "+" : ""}${outcome.reputationDelta}`}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Clock</p>
                <p className={`num text-[13px] font-black ${outcome.daysDelta > 0 ? "text-amber-400" : "text-slate-400"}`}>
                  {outcome.daysDelta === 0 ? "—" : `-${outcome.daysDelta}d`}
                </p>
              </div>
            </div>

            <button type="button" onClick={close} className="btn-primary w-full py-2.5">
              Carry on
            </button>
          </div>
        ) : (
          <div className="space-y-2 p-6">
            {pendingEvent.choices.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => choose(c.key)}
                disabled={busy}
                className="btn-ghost w-full justify-start px-4 py-3 text-left text-[13px]"
              >
                {c.label}
              </button>
            ))}
            {error && <p className="pt-1 text-[12px] font-semibold text-loss">{error}</p>}
            <p className="pt-1 text-center text-[11px] text-slate-600">
              The outcome is drawn on the server. There is no safe option.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
