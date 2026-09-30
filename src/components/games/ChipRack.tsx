"use client";

import { useBet } from "@/components/BetProvider";
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
const FACES = [
  { ring: "#e5e7eb", face: "from-slate-100 to-slate-300", ink: "#1f2937" },
  { ring: "#ef4444", face: "from-red-500 to-red-700", ink: "#fff" },
  { ring: "#22c55e", face: "from-emerald-500 to-emerald-700", ink: "#fff" },
  { ring: "#0f172a", face: "from-slate-700 to-slate-950", ink: "#fff" },
  { ring: "#a855f7", face: "from-purple-500 to-purple-800", ink: "#fff" },
  { ring: "#f0c75e", face: "from-amber-400 to-amber-600", ink: "#2a1d05" },
] as const;

/** Fractions of the player's table limit each chip in the rack represents. */
const FRACTIONS = [0.0004, 0.002, 0.01, 0.05, 0.2, 1];

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

  const values = Array.from(
    new Set(
      FRACTIONS.map((f, i) =>
        i === FRACTIONS.length - 1 ? maxBetCents : Math.min(maxBetCents, niceChipValue(maxBetCents * f)),
      ),
    ),
  ).sort((a, b) => a - b);

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {values.map((v, i) => {
        const face = FACES[Math.min(i, FACES.length - 1)];
        const selected = betCents === v;
        return (
          <button
            key={v}
            type="button"
            disabled={disabled}
            onClick={() => setBetCents(v)}
            title={`Bet ${chipLabel(v)} per chip`}
            className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-b shadow-tile transition disabled:cursor-not-allowed disabled:opacity-50 ${face.face} ${
              selected ? "-translate-y-1 scale-110 ring-2 ring-offset-2 ring-offset-base-900" : "hover:-translate-y-0.5"
            }`}
            style={{
              // A dashed outer ring, like a chip's edge markings.
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
            <span className="num relative text-[11px] font-black leading-none" style={{ color: face.ink }}>
              {chipLabel(v)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
