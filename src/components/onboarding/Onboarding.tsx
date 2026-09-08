"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/components/WalletProvider";
import { ONBOARDING_STEPS, STARTER_GAME_SLUG } from "@/lib/onboarding";
import { IconClose } from "@/components/Icons";

/**
 * The first-run explainer.
 *
 * Four screens, shown once, to an account that has never seen them. It is
 * skippable from every step and closes on Escape, because a player who already
 * knows what this is should be able to get past it in one keystroke — a
 * tutorial you cannot leave is worse than no tutorial.
 *
 * It grants nothing and changes nothing about the account except the timestamp
 * that stops it appearing again.
 */
export default function Onboarding() {
  const { onboarded, loading, markOnboarded } = useWallet();
  const [step, setStep] = useState(0);
  const [closing, setClosing] = useState(false);
  const router = useRouter();

  const finish = useCallback(
    async (outcome: "completed" | "skipped") => {
      if (closing) return;
      setClosing(true);
      // Optimistic: the overlay comes down immediately either way. If the write
      // fails the player simply sees it once more next time, which is a far
      // better failure than a modal that will not close.
      markOnboarded();
      try {
        await fetch("/api/me/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outcome }),
        });
      } catch {
        /* see above */
      }
      if (outcome === "completed") router.push(`/game/${STARTER_GAME_SLUG}`);
    },
    [closing, markOnboarded, router],
  );

  const showing = !loading && !onboarded && !closing;

  useEffect(() => {
    if (!showing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void finish("skipped");
    };
    document.addEventListener("keydown", onKey);
    // The page behind must not scroll while this is up.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [showing, finish]);

  if (!showing) return null;

  const current = ONBOARDING_STEPS[step];
  const last = step === ONBOARDING_STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-base-950/80 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="animate-banner-in panel w-full max-w-lg overflow-hidden p-0">
        <div className="flex items-center gap-3 border-b border-white/5 px-6 py-4">
          <div className="flex gap-1.5" aria-hidden="true">
            {ONBOARDING_STEPS.map((s, i) => (
              <span
                key={s.key}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? "w-6 bg-volt" : i < step ? "w-1.5 bg-volt/50" : "w-1.5 bg-white/15"
                }`}
              />
            ))}
          </div>
          <span className="num text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            {step + 1} / {ONBOARDING_STEPS.length}
          </span>
          <button
            type="button"
            onClick={() => void finish("skipped")}
            className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 transition hover:text-slate-200"
          >
            Skip
            <IconClose className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="px-6 py-6">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-volt">
            {current.eyebrow}
          </p>
          <h2
            id="onboarding-title"
            className="font-display mt-2 text-2xl font-black leading-tight tracking-tight text-white"
          >
            {current.title}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">{current.body}</p>

          {current.facts && (
            <div className="mt-5 grid grid-cols-3 gap-2">
              {current.facts.map((f) => (
                <div key={f.label} className="rounded-xl border border-white/5 bg-base-900/60 p-3">
                  <p className="num text-base font-black text-white">{f.value}</p>
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                    {f.label}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-white/5 px-6 py-4">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="btn-ghost px-4 py-2 text-xs"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => (last ? void finish("completed") : setStep((s) => s + 1))}
            className="btn-primary ml-auto px-5 py-2.5 text-sm"
          >
            {current.cta}
          </button>
        </div>
      </div>
    </div>
  );
}
