"use client";

/**
 * Sound effects, synthesized on the fly rather than shipped as audio files —
 * consistent with the rest of the app (every icon and card face is drawn
 * code too), and it means there is nothing to license, host or fetch.
 *
 * A single `AudioContext` is created lazily on the first call, because
 * browsers refuse to start one before a user gesture; every sound after
 * that reuses it. If audio is blocked, unsupported, or the user has muted
 * it, every function here is a silent no-op — nothing in the app depends
 * on a sound actually playing.
 */

const STORAGE_KEY = "winit.sound.muted";

let ctx: AudioContext | null = null;
let muted = false;
let loadedMuted = false;

function loadMuted(): boolean {
  if (loadedMuted) return muted;
  loadedMuted = true;
  try {
    muted = localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    muted = false;
  }
  return muted;
}

export function isSoundMuted(): boolean {
  return loadMuted();
}

export function setSoundMuted(next: boolean): void {
  muted = next;
  loadedMuted = true;
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* private-browsing or storage disabled — the toggle still works this tab */
  }
}

function audioCtx(): AudioContext | null {
  if (loadMuted()) return null;
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

/**
 * One note: a short envelope (quick attack, exponential decay) around an
 * oscillator, so it reads as a chime or a blip rather than a raw buzz.
 */
function note(
  freq: number,
  { at = 0, duration = 0.18, gain = 0.09, type = "sine" as OscillatorType, sweep = 0 } = {},
): void {
  const c = audioCtx();
  if (!c) return;
  const start = c.currentTime + at;
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq + sweep), start + duration);
  amp.gain.setValueAtTime(0, start);
  amp.gain.linearRampToValueAtTime(gain, start + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp).connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** A named sequence of notes, so a "win" or "level up" is one function call. */
const sfx = {
  /** A neutral UI tap — a bet placed, a control pressed. */
  click: () => note(720, { duration: 0.05, gain: 0.05, type: "square" }),
  /** A settled bet that lost. Short and low, not harsh. */
  lose: () => note(180, { duration: 0.22, gain: 0.07, type: "sine", sweep: -60 }),
  /** A settled bet that won, below celebration-tier size. */
  win: () => {
    note(660, { duration: 0.12, gain: 0.08 });
    note(880, { at: 0.09, duration: 0.22, gain: 0.09 });
  },
  /** Tiered win celebrations (NICE through EPIC) — richer with size. */
  bigWin: (tier: "NICE" | "BIG" | "HUGE" | "MEGA" | "EPIC") => {
    const runs: Record<typeof tier, number[]> = {
      NICE: [523, 659, 784],
      BIG: [523, 659, 784, 1047],
      HUGE: [440, 554, 659, 880, 1109],
      MEGA: [392, 494, 587, 784, 988, 1175],
      EPIC: [349, 440, 523, 698, 880, 1047, 1397],
    };
    runs[tier].forEach((f, i) => note(f, { at: i * 0.07, duration: 0.3, gain: 0.08 }));
  },
  /** A level up — a short triumphant two-note fanfare. */
  levelUp: () => {
    note(523, { duration: 0.14, gain: 0.09, type: "triangle" });
    note(784, { at: 0.12, duration: 0.32, gain: 0.1, type: "triangle" });
  },
  /** An achievement, VIP tier, reputation tier or challenge unlocking. */
  award: () => {
    note(587, { duration: 0.1, gain: 0.08, type: "triangle" });
    note(880, { at: 0.08, duration: 0.24, gain: 0.09, type: "triangle" });
  },
  /** Coins landing — the daily bonus, a promo code, a referral payout. */
  coin: () => {
    note(988, { duration: 0.08, gain: 0.07 });
    note(1319, { at: 0.06, duration: 0.16, gain: 0.07 });
  },
  /** A chat or inbox message arriving. Soft, easy to ignore. */
  notify: () => note(1046, { duration: 0.09, gain: 0.05, type: "sine" }),
} as const;

export default sfx;
