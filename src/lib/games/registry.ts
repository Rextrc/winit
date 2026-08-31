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
    slug: "volt-reels",
    name: "Volt Reels",
    tagline: "5×3, 10 lines, wilds, free spins and bonus buys",
    category: "slots",
    // Closed form, not simulated: see exactRtp() in src/lib/games/slots.ts.
    rtp: SLOTS_EXACT_RTP,
    rtpNote:
      "Exact — 9^5 line enumeration, binomial scatter counts and the retrigger series, not a simulation.",
    playable: true,
    tags: ["Slots", "Free spins", "Bonus buy"],
    art: "from-volt-600/70 via-base-700 to-base-900",
    glyph: "≡",
    popularity: 99,
    new: true,
  },
  {
    slug: "single-zero",
    name: "Single Zero",
    tagline: "European roulette, true odds on every bet",
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
    slug: "twenty-one",
    name: "Twenty-One",
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
  // --- Placeholder tiles: layout only, not implemented. ---
  {
    slug: "neon-cascade",
    name: "Neon Cascade",
    tagline: "Cluster pays — in the workshop",
    category: "slots",
    rtp: null,
    rtpNote: "Not built yet.",
    playable: false,
    tags: ["Slots"],
    art: "from-base-400 via-base-700 to-base-900",
    glyph: "▤",
    popularity: 71,
    new: true,
  },
  {
    slug: "afterburner",
    name: "Afterburner",
    tagline: "Megaways-style reels — in the workshop",
    category: "slots",
    rtp: null,
    rtpNote: "Not built yet.",
    playable: false,
    tags: ["Slots"],
    art: "from-base-300/60 via-base-700 to-base-900",
    glyph: "◈",
    popularity: 64,
  },
  {
    slug: "hi-lo",
    name: "Hi-Lo",
    tagline: "Card climb — in the workshop",
    category: "originals",
    rtp: null,
    rtpNote: "Not built yet.",
    playable: false,
    tags: ["Original"],
    art: "from-volt-800/60 via-base-700 to-base-900",
    glyph: "▲",
    popularity: 68,
  },
  {
    slug: "gridrunner",
    name: "Gridrunner",
    tagline: "Pick your path — in the workshop",
    category: "originals",
    rtp: null,
    rtpNote: "Not built yet.",
    playable: false,
    tags: ["Original"],
    art: "from-base-500 via-base-700 to-base-900",
    glyph: "⬡",
    popularity: 59,
    new: true,
  },
  {
    slug: "baccarat-room",
    name: "Baccarat Room",
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
  "volt-reels": "slots",
  "twenty-one": "blackjack",
  "single-zero": "roulette",
};

export const SLUG_FOR_ENGINE: Record<string, string> = {
  slots: "volt-reels",
  blackjack: "twenty-one",
  roulette: "single-zero",
};
