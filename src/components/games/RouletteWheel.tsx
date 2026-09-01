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
const SPIN_MS = 3400;

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

const FILL = { red: "#d4183d", black: "#14151c", zero: "#1668d8" } as const;
const EASE = "cubic-bezier(0.12, 0.7, 0.16, 1)";

/**
 * The wheel. When `pocket` changes it spins several full turns and decelerates
 * onto the winning number — the visual only, the result is already decided
 * server-side before this ever animates.
 *
 * A ball orbits a fixed outer track independently of the wheel — spinning the
 * opposite way, on the same timing curve — so it visually drops into place at
 * the pointer exactly as the wheel settles, the way a real wheel reads.
 */
export default function RouletteWheel({
  pocket,
  spinning,
}: {
  pocket: number | null;
  spinning: boolean;
}) {
  const [rotation, setRotation] = useState(0);
  const [ballRotation, setBallRotation] = useState(0);
  const turns = useRef(0);
  const ballTurns = useRef(0);

  useEffect(() => {
    if (pocket === null) return;
    const index = WHEEL_ORDER.indexOf(pocket);
    if (index < 0) return;

    // Always add whole turns so consecutive identical pockets still spin.
    turns.current += 5;
    ballTurns.current += 7;
    setRotation(turns.current * 360 - index * SECTOR);
    // The ball spins the opposite way and always settles back at the fixed
    // pointer (angle 0) — independent of the wheel's own rotation.
    setBallRotation(-(ballTurns.current * 360));
  }, [pocket]);

  const resultColor = pocket === null ? null : FILL[colorOf(pocket)];

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[280px]">
      {/* Pointer */}
      <div
        className="absolute left-1/2 top-0 z-20 h-0 w-0 -translate-x-1/2 border-x-[7px] border-t-[13px] border-x-transparent border-t-[#f0c75e] drop-shadow-[0_2px_2px_rgba(0,0,0,0.6)]"
        aria-hidden="true"
      />

      <svg viewBox="0 0 200 200" className="h-full w-full">
        <defs>
          <radialGradient id="rim-gold" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#fff3c4" />
            <stop offset="45%" stopColor="#e0ab3d" />
            <stop offset="100%" stopColor="#8a5f18" />
          </radialGradient>
          <radialGradient id="hub-metal" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#3a3f52" />
            <stop offset="60%" stopColor="#1a1d29" />
            <stop offset="100%" stopColor="#0a0b11" />
          </radialGradient>
        </defs>

        {/* Outer gold rim + fixed ball track */}
        <circle cx="100" cy="100" r="99" fill="url(#rim-gold)" />
        <circle cx="100" cy="100" r="93" fill="#070c1a" stroke="rgba(255,255,255,0.08)" />

        {/* Ball, orbiting the fixed track independently of the wheel */}
        <g
          style={{
            transform: `rotate(${ballRotation}deg)`,
            transformOrigin: "100px 100px",
            transition: spinning || pocket !== null ? `transform ${SPIN_MS}ms ${EASE}` : "none",
          }}
        >
          <circle cx="100" cy="8" r="3.4" fill="#fdfdfd" stroke="#8a5f18" strokeWidth="0.5" />
        </g>

        <g
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: "100px 100px",
            transition: `transform ${SPIN_MS}ms ${EASE}`,
          }}
        >
          {WHEEL_ORDER.map((n, i) => {
            const angle = i * SECTOR;
            const labelR = (R + INNER) / 2 - 4;
            const rad = ((angle - 90) * Math.PI) / 180;
            return (
              <g key={n}>
                <path d={sectorPath(i)} fill={FILL[colorOf(n)]} stroke="#0a0b11" strokeWidth="0.6" />
                <text
                  x={100 + labelR * Math.cos(rad)}
                  y={100 + labelR * Math.sin(rad)}
                  fill="#f5f0e0"
                  fontSize="7.5"
                  fontWeight="800"
                  textAnchor="middle"
                  dominantBaseline="central"
                  transform={`rotate(${angle} ${100 + labelR * Math.cos(rad)} ${100 + labelR * Math.sin(rad)})`}
                >
                  {n}
                </text>
              </g>
            );
          })}
          {/* Metal separator pins between pockets, for a machined look */}
          {WHEEL_ORDER.map((_, i) => {
            const rad = ((i * SECTOR - SECTOR / 2 - 90) * Math.PI) / 180;
            return (
              <circle
                key={i}
                cx={100 + R * Math.cos(rad)}
                cy={100 + R * Math.sin(rad)}
                r="1.3"
                fill="#e0ab3d"
              />
            );
          })}
          <circle cx="100" cy="100" r={INNER} fill="url(#hub-metal)" stroke="#e0ab3d" strokeWidth="1.2" />
          {/* Hub spokes */}
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <rect key={a} x="98.5" y="70" width="3" height="30" rx="1.5" fill="#2a2e3d" transform={`rotate(${a} 100 100)`} />
          ))}
        </g>

        {/* Center cap / result readout */}
        <circle cx="100" cy="100" r="32" fill="url(#hub-metal)" stroke="#e0ab3d" strokeWidth="1.4" />
        <text
          x="100"
          y="100"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={pocket !== null && !spinning ? "28" : "12"}
          fontWeight="900"
          fill={spinning ? "#8a8fa8" : pocket === null ? "#5a5f75" : resultColor === "#14151c" ? "#f5f0e0" : resultColor!}
        >
          {spinning ? "…" : pocket === null ? "SPIN" : pocket}
        </text>
      </svg>
    </div>
  );
}
