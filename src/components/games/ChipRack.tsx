"use client";

import { useBet } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { chipLabel } from "@/lib/money";

/** The smallest a chip is ever allowed to be worth — $1, so nothing rounds
 * away to a "0.00" chip once it's shown as a whole-dollar label. */
const MIN_CHIP_CENTS = 100;

/** Rounds down to the nearest 1/2/5 × 10^n — the sizes real chip sets use. */
function niceChipValue(target: number): number {
  if (target <= MIN_CHIP_CENTS) return MIN_CHIP_CENTS;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const steps = [1, 2, 5, 10];
  let best = magnitude;
  for (const s of steps) {
    const v = s * magnitude;
    if (v <= target) best = v;
  }
  return Math.max(MIN_CHIP_CENTS, Math.round(best));
}

/** Classic casino colours, lightest denomination to highest. */
export const CHIP_FACES = [
  { ring: "#e5e7eb", face: "from-slate-100 to-slate-300", ink: "#1f2937" },
  { ring: "#ef4444", face: "from-red-500 to-red-700", ink: "#fff" },
  { ring: "#22c55e", face: "from-emerald-500 to-emerald-700", ink: "#fff" },
  { ring: "#0f172a", face: "from-slate-700 to-slate-950", ink: "#fff" },
  { ring: "#a855f7", face: "from-purple-500 to-purple-800", ink: "#fff" },
  { ring: "#f0c75e", face: "from-amber-400 to-amber-600", ink: "#2a1d05" },
] as const;

/** Fractions of the player's table limit each chip in the rack represents. */
const FRACTIONS = [0.0004, 0.002, 0.01, 0.05, 0.2, 1];

/** The rack's actual denominations for a given table limit — the same six
 * values `ChipRack` renders as buttons, exposed so a stack sitting on a
 * board (Roulette's felt) can be coloured by the same scale. */
export function chipDenominations(maxBetCents: number): number[] {
  return Array.from(
    new Set(
      FRACTIONS.map((f, i) =>
        i === FRACTIONS.length - 1 ? maxBetCents : Math.min(maxBetCents, niceChipValue(maxBetCents * f)),
      ),
    ),
  ).sort((a, b) => a - b);
}

/** Which of the rack's denominations a stacked amount reads closest to —
 * the tallest one it can "cover" — so a bigger stack on the board shows as
 * a visibly bigger-denomination chip, not just a bigger number. */
export function chipTierIndex(amountCents: number, maxBetCents: number): number {
  const values = chipDenominations(maxBetCents);
  let idx = 0;
  for (let i = 0; i < values.length; i++) if (amountCents >= values[i]) idx = i;
  return idx;
}

/**
 * The bare chip face — no button, no interaction — so a stack sitting on a
 * board can look exactly like one of the rack's own chips at any size.
 */
export function ChipFace({
  value,
  tier,
  selected = false,
  className = "h-11 w-11",
  labelClassName = "text-[11px]",
}: {
  value: number;
  tier: number;
  selected?: boolean;
  className?: string;
  labelClassName?: string;
}) {
  const face = CHIP_FACES[Math.min(Math.max(tier, 0), CHIP_FACES.length - 1)];
  return (
    <div
      className={`relative grid shrink-0 place-items-center rounded-full bg-gradient-to-b shadow-tile ${face.face} ${className}`}
      style={{
        boxShadow: selected
          ? `0 0 0 2px ${face.ring}, 0 10px 20px -8px rgba(0,0,0,0.7)`
          : `0 0 0 1.5px ${face.ring}99, 0 6px 14px -8px rgba(0,0,0,0.6)`,
      }}
    >
      <span
        className="absolute inset-[3px] rounded-full opacity-70"
        style={{
          backgroundImage: `repeating-conic-gradient(${face.ring} 0deg 12deg, transparent 12deg 30deg)`,
          mask: "radial-gradient(circle, transparent 62%, black 64%, black 78%, transparent 80%)",
          WebkitMask: "radial-gradient(circle, transparent 62%, black 64%, black 78%, transparent 80%)",
        }}
        aria-hidden="true"
      />
      <span className={`num relative font-black leading-none ${labelClassName}`} style={{ color: face.ink }}>
        {chipLabel(value)}
      </span>
    </div>
  );
}

/**
 * A rack of real casino chips — pick a denomination by clicking it, the way
 * every physical table works, instead of typing a dollar amount into a text
 * field. Denominations scale with the player's own table limit (which can
 * be anywhere from $1,000 to over a billion depending on level and rebirth),
 * so the rack is always six meaningfully-different stakes rather than a
 * fixed set that's either trivial or unreachable.
 */
export default function ChipRack({ disabled = false }: { disabled?: boolean }) {
  const { betCents, maxBetCents, setBetCents } = useBet();
  const { balanceCents } = useWallet();
  // Scale the rack to whatever the player can actually stake right now, not
  // a table limit that might be far past their balance — true for a broke
  // player under a normal cap, and especially true for an unlimited-bets
  // account, whose "limit" is a deliberately astronomical placeholder.
  const values = chipDenominations(Math.min(maxBetCents, balanceCents || maxBetCents));

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {values.map((v, i) => (
        <button
          key={v}
          type="button"
          disabled={disabled}
          onClick={() => setBetCents(v)}
          title={`Bet ${chipLabel(v)} per chip`}
          className={`transition disabled:cursor-not-allowed disabled:opacity-50 ${
            betCents === v ? "-translate-y-1 scale-110" : "hover:-translate-y-0.5"
          }`}
        >
          <ChipFace value={v} tier={i} selected={betCents === v} />
        </button>
      ))}
    </div>
  );
}
