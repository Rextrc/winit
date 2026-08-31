import { exactRtp as slotsExactRtp } from "@/lib/games/slots";

/** The game catalogue that drives the sidebar, home rows and hero carousel. */

const SLOTS_EXACT_RTP = slotsExactRtp();

export type Category = "slots" | "table" | "live" | "originals";

export type GameDef = {
  slug: string;
  name: string;
  tagline: string;
  category: Category;
  /** Documented return to player, as a fraction. Null = depends on decisions. */
  rtp: number | null;
  rtpNote: string;
  /** Playable now, or a placeholder tile. */
  playable: boolean;
  tags: string[];
  /** Tailwind gradient classes for the tile art (all original, no assets). */
  art: string;
  glyph: string;
  new?: boolean;
  popularity: number;
};

export const CATEGORY_LABELS: Record<Category, string> = {
  slots: "Slots",
  table: "Table Games",
  live: "Live",
  originals: "Originals",
};

export const GAMES: GameDef[] = [
  {
    slug: "fruit-machine",
    name: "Fruit Machine",
    tagline: "5×3 fruit reels — wilds, free spins and bonus buys",
    category: "slots",
    // Closed form, not simulated: see exactRtp() in src/lib/games/slots.ts.
    rtp: SLOTS_EXACT_RTP,
    rtpNote:
      "Exact — 9^5 line enumeration, binomial scatter counts and the retrigger series, not a simulation.",
    playable: true,
    tags: ["Slots", "Free spins", "Bonus buy"],
    art: "from-volt-600/70 via-base-700 to-base-900",
    glyph: "🍒",
    popularity: 99,
    new: true,
  },
  {
    slug: "european-roulette",
    name: "European Roulette",
    tagline: "Single zero, true odds on every bet",
    category: "table",
    rtp: 36 / 37,
    rtpNote: "36/37 on every bet type — the only edge is the green pocket.",
    playable: true,
    tags: ["Roulette", "Table"],
    art: "from-loss/50 via-base-700 to-base-900",
    glyph: "◎",
    popularity: 94,
  },
  {
    slug: "blackjack",
    name: "Blackjack",
    tagline: "6 decks, S17, blackjack pays 3:2",
    category: "table",
    rtp: 0.994,
    rtpNote: "≈99.4% ceiling with full basic strategy — your decisions move this number.",
    playable: true,
    tags: ["Blackjack", "Skill"],
    art: "from-win/40 via-base-700 to-base-900",
    glyph: "♠",
    popularity: 97,
  },
  // --- Originals: instant-settle games built on one shared fair-multiplier
  // formula (multiplier = 0.99 / P(win)) — see src/lib/games/originals.ts. ---
  {
    slug: "dice",
    name: "Dice",
    tagline: "Roll over or under — pick your own odds",
    category: "originals",
    rtp: 0.99,
    rtpNote: "Exactly 99% for every valid target: multiplier = 0.99 / P(win), computed live.",
    playable: true,
    tags: ["Original", "Provably fair maths"],
    art: "from-emerald-700/50 via-base-700 to-base-900",
    glyph: "🎲",
    popularity: 88,
    new: true,
  },
  {
    slug: "limbo",
    name: "Limbo",
    tagline: "Set a target multiplier and see if it holds",
    category: "originals",
    rtp: 0.99,
    rtpNote: "Exactly 99% for every target: P(result ≥ M) = 0.99 / M by construction.",
    playable: true,
    tags: ["Original", "Provably fair maths"],
    art: "from-indigo-700/50 via-base-700 to-base-900",
    glyph: "📈",
    popularity: 84,
    new: true,
  },
  {
    slug: "coinflip",
    name: "Coinflip",
    tagline: "Heads or tails, 1.98x on a win",
    category: "originals",
    rtp: 0.99,
    rtpNote: "Exactly 99% — a true 50/50 at the fair price for a 1% house edge.",
    playable: true,
    tags: ["Original", "Provably fair maths"],
    art: "from-amber-700/50 via-base-700 to-base-900",
    glyph: "🪙",
    popularity: 80,
  },
  {
    slug: "wheel",
    name: "Wheel",
    tagline: "Spin a 10-segment wheel at your chosen risk",
    category: "originals",
    rtp: 0.99,
    rtpNote: "Exactly 99% at every risk level — segment multipliers sum to 9.9 across 10 equal segments.",
    playable: true,
    tags: ["Original"],
    art: "from-rose-700/50 via-base-700 to-base-900",
    glyph: "🎡",
    popularity: 76,
  },
  {
    slug: "plinko",
    name: "Plinko",
    tagline: "Drop a ball through a peg board into a multiplier",
    category: "originals",
    rtp: 0.99,
    rtpNote: "Computed exactly per board from the true Binomial(rows, 1/2) bucket distribution.",
    playable: true,
    tags: ["Original"],
    art: "from-cyan-700/50 via-base-700 to-base-900",
    glyph: "⚬",
    popularity: 90,
    new: true,
  },
  {
    slug: "keno",
    name: "Keno",
    tagline: "Pick numbers, 10 are drawn from 40",
    category: "originals",
    rtp: 0.99,
    rtpNote: "Exactly 99% for any pick count — the paytable is derived from the exact hypergeometric odds.",
    playable: true,
    tags: ["Original"],
    art: "from-fuchsia-700/50 via-base-700 to-base-900",
    glyph: "🔢",
    popularity: 72,
  },
  // --- Placeholder tiles: layout only, not implemented. ---
  {
    slug: "baccarat-room",
    name: "Baccarat",
    tagline: "Punto banco — in the workshop",
    category: "table",
    rtp: null,
    rtpNote: "Not built yet.",
    playable: false,
    tags: ["Table"],
    art: "from-base-400/80 via-base-700 to-base-900",
    glyph: "◇",
    popularity: 55,
  },
  {
    slug: "studio-one",
    name: "Studio One",
    tagline: "Simulated live table — in the workshop",
    category: "live",
    rtp: null,
    rtpNote: "Not built yet. Nothing here streams anywhere.",
    playable: false,
    tags: ["Live"],
    art: "from-loss/30 via-base-700 to-base-900",
    glyph: "◉",
    popularity: 61,
  },
  {
    slug: "studio-two",
    name: "Studio Two",
    tagline: "Simulated live wheel — in the workshop",
    category: "live",
    rtp: null,
    rtpNote: "Not built yet. Nothing here streams anywhere.",
    playable: false,
    tags: ["Live"],
    art: "from-win/25 via-base-700 to-base-900",
    glyph: "◍",
    popularity: 52,
  },
];

export function gameBySlug(slug: string): GameDef | undefined {
  return GAMES.find((g) => g.slug === slug);
}

export function gamesByCategory(category: Category): GameDef[] {
  return GAMES.filter((g) => g.category === category);
}

export const PLAYABLE = GAMES.filter((g) => g.playable);

/** Maps a game slug to the engine key used in the transaction log. */
export const ENGINE_KEY: Record<string, string> = {
  "fruit-machine": "slots",
  "blackjack": "blackjack",
  "european-roulette": "roulette",
  dice: "dice",
  limbo: "limbo",
  coinflip: "coinflip",
  wheel: "wheel",
  plinko: "plinko",
  keno: "keno",
};

export const SLUG_FOR_ENGINE: Record<string, string> = {
  slots: "fruit-machine",
  blackjack: "blackjack",
  roulette: "european-roulette",
  dice: "dice",
  limbo: "limbo",
  coinflip: "coinflip",
  wheel: "wheel",
  plinko: "plinko",
  keno: "keno",
};
