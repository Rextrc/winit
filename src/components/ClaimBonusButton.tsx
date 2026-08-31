"use client";

import { useState } from "react";
import { IconGift } from "@/components/Icons";
import { useWallet } from "@/components/WalletProvider";
import { formatCents } from "@/lib/money";

function countdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

/**
 * The only top-up in WinIt. It grants fake credits on a cooldown — there is no
 * purchase flow behind it and no payment code in this project.
 */
export default function ClaimBonusButton({ full = false }: { full?: boolean }) {
  const { bonus, claimBonus, claiming } = useWallet();
  const [error, setError] = useState<string | null>(null);

  const claimable = bonus?.claimable ?? false;
  const unknown = bonus === null;

  const onClick = async () => {
    setError(null);
    const res = await claimBonus();
    if (!res.ok) setError(res.error ?? "Couldn't claim right now.");
  };

  return (
    <div className={full ? "w-full" : ""}>
      <button
        type="button"
        onClick={onClick}
        disabled={!claimable || claiming || unknown}
        className={[
          claimable ? "btn-primary" : "btn-ghost",
          full ? "w-full" : "",
          claimable ? "shadow-volt" : "",
        ].join(" ")}
        title={
          claimable
            ? `Claim ${formatCents(bonus?.amountCents ?? 0)} play credits`
            : "Your next bonus isn't ready yet"
        }
      >
        <IconGift className="h-4 w-4" />
        {claiming ? (
          "Claiming…"
        ) : claimable ? (
          <>
            <span className="hidden sm:inline">Claim bonus</span>
            <span className="sm:hidden">Bonus</span>
          </>
        ) : unknown ? (
          <span className="text-xs">Bonus</span>
        ) : (
          <span className="num text-xs">{countdown(bonus.msRemaining)}</span>
        )}
      </button>
      {error && <p className="mt-1 text-right text-[11px] text-loss">{error}</p>}
    </div>
  );
}
