"use client";

import { useEffect, useState } from "react";
import { useBet } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { MIN_BET_CENTS, formatCents, parseAmountToCents } from "@/lib/money";

/**
 * Stake input plus the standard sizing shortcuts. Bound to the shared bet slip
 * so the amount is the same on every game and in the docked bar.
 */
export default function BetControls({
  disabled = false,
  compact = false,
}: {
  disabled?: boolean;
  compact?: boolean;
}) {
  const { betCents, maxBetCents, setBetCents, halve, double, max, betError } = useBet();
  const { balanceCents } = useWallet();
  const [text, setText] = useState(() => (betCents / 100).toFixed(2));
  const [editing, setEditing] = useState(false);

  // Mirror external changes (1/2, 2x, max, restored stake) into the input.
  useEffect(() => {
    if (!editing) setText((betCents / 100).toFixed(2));
  }, [betCents, editing]);

  const atMax = balanceCents !== null && betCents >= Math.min(maxBetCents, balanceCents);

  return (
    <div className={compact ? "" : "space-y-2"}>
      {!compact && (
        <div className="flex items-baseline justify-between">
          <label htmlFor="bet-amount" className="label mb-0">
            Bet amount
          </label>
          <span className="num text-[11px] text-slate-500">
            {formatCents(MIN_BET_CENTS)} – {formatCents(maxBetCents)}
          </span>
        </div>
      )}

      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <input
            id="bet-amount"
            inputMode="decimal"
            value={text}
            disabled={disabled}
            onFocus={() => setEditing(true)}
            onChange={(e) => {
              setText(e.target.value);
              const cents = parseAmountToCents(e.target.value);
              if (cents !== null) setBetCents(cents);
            }}
            onBlur={() => {
              setEditing(false);
              const cents = parseAmountToCents(text);
              const next = cents === null ? MIN_BET_CENTS : Math.max(MIN_BET_CENTS, cents);
              setBetCents(Math.min(next, maxBetCents));
            }}
            className={`field num pr-2 font-bold ${betError ? "!border-loss/60" : ""}`}
            aria-label="Bet amount"
          />
        </div>

        <div className="flex items-stretch gap-1.5">
          <button type="button" className="btn-chip" onClick={halve} disabled={disabled || betCents <= MIN_BET_CENTS}>
            ½
          </button>
          <button type="button" className="btn-chip" onClick={double} disabled={disabled || atMax}>
            2×
          </button>
          <button type="button" className="btn-chip" onClick={max} disabled={disabled || atMax}>
            Max
          </button>
        </div>
      </div>

      {betError && <p className="text-[11px] font-semibold text-loss">{betError}</p>}
    </div>
  );
}
