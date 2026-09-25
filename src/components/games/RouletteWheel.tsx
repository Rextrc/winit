"use client";

import { useEffect, useRef } from "react";
import { colorOf } from "@/lib/games/roulette";

/** Physical pocket order of a European single-zero wheel. */
export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14,
  31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

/** From launch to the ball coming to rest in its pocket. */
export const BALL_MS = 7200;

const SECTOR = 360 / WHEEL_ORDER.length;
const C = 120;
const WHEEL_DEG_PER_MS = 0.04; // the rotor never stops, like a live table

// Radii, outside in.
const BOWL = 118;
const TRACK_OUT = 110;
const TRACK_IN = 94;
const BALL_TRACK = 102;
const NUM_OUT = 93;
const NUM_IN = 72;
const POCKET_IN = 57;
const BALL_POCKET = 64.5;

const FILL = { red: "#d42a3c", black: "#1b2030", zero: "#1f9d55" } as const;

/**
 * `Math.cos`/`Math.sin` are not guaranteed bit-identical between the server
 * and the browser, and React string-diffs SSR markup on hydration. Rounding
 * to three decimals makes both sides agree regardless of the last bit.
 */
function r3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function polar(r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [r3(C + r * Math.cos(rad)), r3(C + r * Math.sin(rad))];
}

function band(r1: number, r2: number, a0: number, a1: number): string {
  const [x1, y1] = polar(r2, a0);
  const [x2, y2] = polar(r2, a1);
  const [x3, y3] = polar(r1, a1);
  const [x4, y4] = polar(r1, a0);
  return `M ${x1} ${y1} A ${r2} ${r2} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${r1} ${r1} 0 0 0 ${x4} ${y4} Z`;
}

const mod360 = (a: number) => ((a % 360) + 360) % 360;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// The final rattle: pocket-to-pocket hops (in sectors, relative to the
// winning pocket), each shorter and lower than the last, ending on 0.
const HOPS = [0, 2.3, -1.2, 0.7, -0.3, 0];
const HOP_LIFT = [6, 4.5, 3, 1.6, 0.8];

type Flight = { t0: number; rel0: number; relDelta: number };

/**
 * A live wheel. The rotor turns continuously from the moment the page opens.
 * When `pocket` arrives (already decided server-side) a ball is launched onto
 * the track against the spin, bleeds off speed, drops through the deflectors
 * and settles into that pocket, then rides round with the rotor until the next
 * launch. The ball's angle is computed relative to the rotor, so it always
 * ends exactly in the right pocket however fast the rotor happens to be.
 */
export default function RouletteWheel({ pocket, launchKey }: { pocket: number | null; launchKey: number }) {
  const rotorRef = useRef<SVGGElement | null>(null);
  const ballRef = useRef<SVGCircleElement | null>(null);
  const shadowRef = useRef<SVGEllipseElement | null>(null);
  const start = useRef<number>(0);
  const flight = useRef<Flight | null>(null);
  const resting = useRef<number | null>(null); // relative angle once in a pocket

  const wheelAngle = (now: number) => (now - start.current) * WHEEL_DEG_PER_MS;

  // Launch a ball whenever a new result comes in.
  useEffect(() => {
    if (pocket === null) return;
    const idx = WHEEL_ORDER.indexOf(pocket);
    if (idx < 0) return;
    const now = performance.now();
    // Enter from wherever the ball is (or the top of the track on the first spin).
    const rel0 = resting.current ?? mod360(0 - wheelAngle(now));
    const target = idx * SECTOR;
    // Travel against the rotor for several laps, landing exactly on `target`.
    const relDelta = -(mod360(rel0 - target) + 360 * 7);
    resting.current = null;
    flight.current = { t0: now, rel0, relDelta };
  }, [launchKey]);

  useEffect(() => {
    start.current = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const w = wheelAngle(now);
      rotorRef.current?.setAttribute("transform", `rotate(${r3(w)} ${C} ${C})`);

      let rel: number | null = null;
      let radius = BALL_TRACK;
      const f = flight.current;
      if (f) {
        const p = Math.min(1, (now - f.t0) / BALL_MS);
        rel = f.rel0 + f.relDelta * easeOutCubic(p);
        if (p < 0.45) radius = BALL_TRACK;
        else if (p < 0.72) {
          // Leaves the track and spirals in, knocked about by the deflectors.
          const q = (p - 0.45) / 0.27;
          radius = BALL_TRACK - (BALL_TRACK - (NUM_IN + 2)) * q * q + Math.abs(Math.sin(q * Math.PI * 3)) * 5 * (1 - q);
        } else {
          // Drops onto the frets and rattles across a few pockets before it
          // sticks — discrete hops, not a smooth slide.
          const q = (p - 0.72) / 0.28;
          const seg = Math.min(HOPS.length - 2, Math.floor(q * (HOPS.length - 1)));
          const t = q * (HOPS.length - 1) - seg;
          const offset = HOPS[seg] + (HOPS[seg + 1] - HOPS[seg]) * easeInOut(t);
          rel += offset * SECTOR;
          const base = BALL_POCKET + (NUM_IN + 2 - BALL_POCKET) * Math.max(0, 1 - q / 0.2);
          radius = base + HOP_LIFT[seg] * 4 * t * (1 - t);
        }
        if (p >= 1) {
          resting.current = f.rel0 + f.relDelta;
          flight.current = null;
        }
      } else if (resting.current !== null) {
        rel = resting.current;
        radius = BALL_POCKET;
      }

      if (rel === null) {
        ballRef.current?.setAttribute("opacity", "0");
        shadowRef.current?.setAttribute("opacity", "0");
      } else {
        const [x, y] = polar(radius, w + rel);
        ballRef.current?.setAttribute("cx", String(x));
        ballRef.current?.setAttribute("cy", String(y));
        ballRef.current?.setAttribute("opacity", "1");
        shadowRef.current?.setAttribute("cx", String(r3(x + 1.2)));
        shadowRef.current?.setAttribute("cy", String(r3(y + 1.8)));
        shadowRef.current?.setAttribute("opacity", "0.45");
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="relative mx-auto -my-4 w-full max-w-[460px] [perspective:1400px] [perspective-origin:50%_50%] sm:-my-6">
      <div className="[transform:rotateX(28deg)] [transform-style:preserve-3d]">
        <svg viewBox="0 0 240 240" className="h-auto w-full drop-shadow-[0_24px_24px_rgba(0,0,0,0.55)]" aria-label="Roulette wheel">
          <defs>
            <radialGradient id="rw-bowl" cx="50%" cy="45%" r="60%">
              <stop offset="70%" stopColor="#3a4258" />
              <stop offset="100%" stopColor="#1c2130" />
            </radialGradient>
            <radialGradient id="rw-track" cx="50%" cy="50%" r="50%">
              <stop offset="80%" stopColor="#262d3f" />
              <stop offset="100%" stopColor="#3b445c" />
            </radialGradient>
            <radialGradient id="rw-cone" cx="45%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#5a6480" />
              <stop offset="100%" stopColor="#2c3347" />
            </radialGradient>
            <radialGradient id="rw-gold" cx="35%" cy="30%" r="80%">
              <stop offset="0%" stopColor="#ffe9a8" />
              <stop offset="50%" stopColor="#f0b43c" />
              <stop offset="100%" stopColor="#a8701a" />
            </radialGradient>
            <radialGradient id="rw-ball" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="70%" stopColor="#dfe3ea" />
              <stop offset="100%" stopColor="#9aa1ae" />
            </radialGradient>
          </defs>

          {/* Bowl and fixed ball track */}
          <circle cx={C} cy={C} r={BOWL} fill="url(#rw-bowl)" />
          <circle cx={C} cy={C} r={TRACK_OUT} fill="url(#rw-track)" stroke="#4a5470" strokeWidth="1" />
          <circle cx={C} cy={C} r={TRACK_IN} fill="#20263a" />
          {/* Deflector diamonds on the track */}
          {Array.from({ length: 8 }, (_, i) => {
            const a = i * 45 + 22.5;
            const [x, y] = polar((TRACK_IN + BALL_TRACK) / 2 - 1, a);
            return <rect key={i} x={x - 2.4} y={y - 2.4} width="4.8" height="4.8" fill="url(#rw-gold)" transform={`rotate(${a + 45} ${x} ${y})`} />;
          })}

          {/* Rotor */}
          <g ref={rotorRef}>
            {WHEEL_ORDER.map((n, i) => {
              const a0 = i * SECTOR - SECTOR / 2;
              const a1 = i * SECTOR + SECTOR / 2;
              const fill = FILL[colorOf(n)];
              const [tx, ty] = polar((NUM_OUT + NUM_IN) / 2, i * SECTOR);
              return (
                <g key={n}>
                  <path d={band(NUM_IN, NUM_OUT, a0, a1)} fill={fill} />
                  <path d={band(POCKET_IN, NUM_IN, a0, a1)} fill={fill} opacity="0.78" />
                  <text
                    x={tx}
                    y={ty}
                    fill="#ffffff"
                    fontSize="8.6"
                    fontWeight="900"
                    stroke="rgba(0,0,0,0.55)"
                    strokeWidth="0.8"
                    paintOrder="stroke"
                    textAnchor="middle"
                    dominantBaseline="central"
                    transform={`rotate(${r3(i * SECTOR)} ${tx} ${ty})`}
                  >
                    {n}
                  </text>
                </g>
              );
            })}
            {/* Frets between pockets */}
            {WHEEL_ORDER.map((_, i) => {
              const [x1, y1] = polar(POCKET_IN, i * SECTOR - SECTOR / 2);
              const [x2, y2] = polar(NUM_OUT, i * SECTOR - SECTOR / 2);
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0b0e14" strokeWidth="0.9" opacity="0.85" />;
            })}
            <circle cx={C} cy={C} r={NUM_OUT} fill="none" stroke="#c9d0dd" strokeOpacity="0.35" strokeWidth="0.8" />
            <circle cx={C} cy={C} r={NUM_IN} fill="none" stroke="#c9d0dd" strokeOpacity="0.5" strokeWidth="0.8" />
            {/* Cone and turret */}
            <circle cx={C} cy={C} r={POCKET_IN} fill="url(#rw-cone)" stroke="#6b7594" strokeWidth="1" />
            {[0, 90, 180, 270].map((a) => {
              const [x, y] = polar(20, a);
              return (
                <g key={a}>
                  <line x1={C} y1={C} x2={x} y2={y} stroke="url(#rw-gold)" strokeWidth="3.2" strokeLinecap="round" />
                  <circle cx={x} cy={y} r="3.2" fill="url(#rw-gold)" />
                </g>
              );
            })}
            <circle cx={C} cy={C} r="8" fill="url(#rw-gold)" stroke="#8a5a14" strokeWidth="0.6" />
            <circle cx={C - 2} cy={C - 2} r="2.4" fill="#fff4cf" opacity="0.8" />
          </g>

          {/* Ball */}
          <ellipse ref={shadowRef} rx="3.4" ry="2.4" fill="#000" opacity="0" />
          <circle ref={ballRef} r="3.6" fill="url(#rw-ball)" opacity="0" />
        </svg>
      </div>
    </div>
  );
}
