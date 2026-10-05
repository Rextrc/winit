"use client";

/**
 * Sound effects. Almost everything here is synthesized on the fly rather
 * than shipped as an audio file — consistent with the rest of the app
 * (every icon and card face is drawn in code too), and it means there is
 * nothing to license, host or fetch. The one exception is the card-deal
 * sample in /public/sfx — "Card Flip" by F4ngy (freesound.org), CC-BY,
 * trimmed — used because a real recording of card stock is not something a
 * synthesizer reproduces convincingly.
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
  // Kick the card-deal sample off right away rather than waiting for the
  // first card to actually need it — by the time one lands, it's usually
  // already decoded.
  void loadCardDealBuffer(ctx);
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

/** A buffer of white noise, the raw material for anything percussive — a
 * card snap, a rolling ball, a skittering bounce — that a pure tone can't do. */
function noiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const buffer = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * seconds)), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** A short filtered burst of noise: a snap, a click, a bounce. */
function burst({
  at = 0,
  duration = 0.05,
  gain = 0.12,
  freq = 2000,
  q = 1,
  type = "bandpass" as BiquadFilterType,
} = {}): void {
  const c = audioCtx();
  if (!c) return;
  const start = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, duration + 0.02);
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const amp = c.createGain();
  amp.gain.setValueAtTime(0, start);
  amp.gain.linearRampToValueAtTime(gain, start + 0.004);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(filter).connect(amp).connect(c.destination);
  src.start(start);
  src.stop(start + duration + 0.02);
}

/** Decoded once per AudioContext and reused — fetching and decoding on
 * every single card dealt would be wasteful and would audibly lag. */
let cardDealBuffer: Promise<AudioBuffer | null> | null = null;

function loadCardDealBuffer(c: AudioContext): Promise<AudioBuffer | null> {
  if (!cardDealBuffer) {
    cardDealBuffer = fetch("/sfx/card-deal.mp3")
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((buf) => c.decodeAudioData(buf))
      .catch(() => null);
  }
  return cardDealBuffer;
}

/** Plays a decoded sample once, through the same gain-ramped pipeline every
 * synthesized sound uses, so muting and output routing stay consistent. */
function sample(buffer: AudioBuffer, { gain = 0.5 }: { gain?: number } = {}): void {
  const c = audioCtx();
  if (!c) return;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const amp = c.createGain();
  amp.gain.value = gain;
  src.connect(amp).connect(c.destination);
  src.start();
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
  /** A single card landing face down or face up — a real recording of card
   * stock (see the file header), fired once per card so a multi-card deal
   * riffles. Falls back to a synthesized snap if the sample can't load. */
  cardDeal: () => {
    const c = audioCtx();
    if (!c) return;
    loadCardDealBuffer(c).then((buf) => {
      if (buf) sample(buf, { gain: 0.5 });
      else {
        burst({ duration: 0.045, gain: 0.16, freq: 3400, q: 0.7, type: "highpass" });
        note(190, { duration: 0.04, gain: 0.025, type: "sine" });
      }
    });
  },
  /** The roulette ball, launch to landing: a rolling hiss that slows and
   * drops in pitch, a skitter of bounces over the frets, then a settling
   * clack into the pocket. Durations are fractions of RouletteWheel's own
   * BALL_MS so the two stay in step without importing across the boundary. */
  rouletteBall: (totalMs = 7200) => {
    const c = audioCtx();
    if (!c) return;
    const total = totalMs / 1000;
    const rollEnd = total * 0.6; // rolling the outer track
    const dropEnd = total * 0.76; // spiralling in past the deflectors
    const start = c.currentTime;

    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c, dropEnd + 0.05);
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(2600, start);
    filter.frequency.exponentialRampToValueAtTime(900, start + rollEnd);
    filter.frequency.exponentialRampToValueAtTime(500, start + dropEnd);
    const amp = c.createGain();
    amp.gain.setValueAtTime(0, start);
    amp.gain.linearRampToValueAtTime(0.05, start + 0.15);
    amp.gain.setValueAtTime(0.05, start + rollEnd * 0.85);
    amp.gain.linearRampToValueAtTime(0.03, start + dropEnd);
    amp.gain.linearRampToValueAtTime(0.0001, start + dropEnd + 0.05);
    src.connect(filter).connect(amp).connect(c.destination);
    src.start(start);
    src.stop(start + dropEnd + 0.1);

    // Skitters over the frets, each bounce further apart than the last.
    let t = dropEnd;
    let gap = 0.035;
    while (t < total - 0.15) {
      burst({ at: t, duration: 0.03, gain: 0.1, freq: 3200 + Math.random() * 900, q: 2 });
      t += gap;
      gap *= 1.35;
    }
    // The settle: it drops into the pocket for good.
    note(140, { at: total - 0.05, duration: 0.18, gain: 0.09, type: "triangle", sweep: -40 });
    burst({ at: total - 0.05, duration: 0.05, gain: 0.12, freq: 1200, q: 1 });
  },
} as const;

export default sfx;
