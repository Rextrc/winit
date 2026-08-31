"use client";

import { useEffect, useRef, useState } from "react";
import { colorOf } from "@/lib/games/roulette";

/** Physical pocket order of a European single-zero wheel. */
export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14,
  31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

const SECTOR = 360 / WHEEL_ORDER.length;
const R = 100;
const INNER = 62;

function sectorPath(index: number): string {
  const start = ((index * SECTOR - SECTOR / 2 - 90) * Math.PI) / 180;
  const end = ((index * SECTOR + SECTOR / 2 - 90) * Math.PI) / 180;

  const x1 = R + R * Math.cos(start);
  const y1 = R + R * Math.sin(start);
  const x2 = R + R * Math.cos(end);
  const y2 = R + R * Math.sin(end);
  const x3 = R + INNER * Math.cos(end);
  const y3 = R + INNER * Math.sin(end);
  const x4 = R + INNER * Math.cos(start);
  const y4 = R + INNER * Math.sin(start);

  return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${INNER} ${INNER} 0 0 0 ${x4} ${y4} Z`;
}

const FILL = { red: "#c8324a", black: "#161b30", green: "#2f7d4f" } as const;

/**
 * The wheel. When `pocket` changes it spins several full turns and decelerates
 * onto the winning number — the visual only, the result is already decided
 * server-side before this ever animates.
 */
export default function RouletteWheel({
  pocket,
  spinning,
}: {
  pocket: number | null;
  spinning: boolean;
}) {
  const [rotation, setRotation] = useState(0);
  const turns = useRef(0);

  useEffect(() => {
    if (pocket === null) return;
    const index = WHEEL_ORDER.indexOf(pocket);
    if (index < 0) return;

    // Always add whole turns so consecutive identical pockets still spin.
    turns.current += 5;
    setRotation(turns.current * 360 - index * SECTOR);
  }, [pocket]);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[260px]">
      {/* Pointer */}
      <div
        className="absolute left-1/2 top-0 z-10 h-0 w-0 -translate-x-1/2 border-x-[8px] border-t-[14px] border-x-transparent border-t-volt"
        aria-hidden="true"
      />

      <svg viewBox="0 0 200 200" className="h-full w-full">
        <circle cx="100" cy="100" r="99" fill="#0d1020" stroke="rgba(255,255,255,0.12)" />
        <g
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: "100px 100px",
            transition: "transform 3.4s cubic-bezier(0.15, 0.75, 0.2, 1)",
          }}
        >
          {WHEEL_ORDER.map((n, i) => {
            const angle = i * SECTOR;
            const labelR = (R + INNER) / 2;
            const rad = ((angle - 90) * Math.PI) / 180;
            return (
              <g key={n}>
                <path d={sectorPath(i)} fill={FILL[colorOf(n)]} stroke="rgba(0,0,0,0.35)" strokeWidth="0.5" />
                <text
                  x={100 + labelR * Math.cos(rad)}
                  y={100 + labelR * Math.sin(rad)}
                  fill="white"
                  fontSize="8"
                  fontWeight="700"
                  textAnchor="middle"
                  dominantBaseline="central"
                  transform={`rotate(${angle} ${100 + labelR * Math.cos(rad)} ${100 + labelR * Math.sin(rad)})`}
                >
                  {n}
                </text>
              </g>
            );
          })}
          <circle cx="100" cy="100" r={INNER} fill="#12162a" stroke="rgba(255,255,255,0.1)" />
        </g>

        {/* Hub / result readout */}
        <circle cx="100" cy="100" r="34" fill="#080a12" stroke="rgba(182,255,46,0.3)" />
        <text
          x="100"
          y="100"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={pocket !== null && !spinning ? "30" : "13"}
          fontWeight="900"
          fill={spinning ? "#64748b" : pocket === null ? "#475569" : FILL[colorOf(pocket)] === "#161b30" ? "#e2e8f0" : FILL[colorOf(pocket)]}
        >
          {spinning ? "…" : pocket === null ? "SPIN" : pocket}
        </text>
      </svg>
    </div>
  );
}
