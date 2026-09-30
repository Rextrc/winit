/** The game catalogue that drives the sidebar, home rows and hero carousel. */

export type Category = "table" | "live" | "originals";

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
  /** Designed cover art in /public/games — replaces the generated tile art when set. */
  cover?: string;
  new?: boolean;
  popularity: number;
};

export const CATEGORY_LABELS: Record<Category, string> = {
  table: "Table Games",
  live: "Live",
  originals: "Originals",
};

export const GAMES: GameDef[] = [

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
    cover: "/games/european-roulette.webp",
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
    cover: "/games/blackjack.webp",
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
    art: "from-sky-700/50 via-base-700 to-base-900",
    glyph: "🎲",
    cover: "/games/dice.webp",
    popularity: 88,
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
    cover: "/games/limbo.webp",
    popularity: 84,
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
    cover: "/games/coinflip.webp",
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
    cover: "/games/wheel.webp",
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
    cover: "/games/plinko.webp",
    popularity: 90,
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
    cover: "/games/keno.webp",
    popularity: 72,
  },
  {
    slug: "baccarat",
    name: "Baccarat",
    tagline: "Punto banco, dealt automatically — no player decisions",
    category: "table",
    rtp: 0.9876,
    rtpNote: "Exact — enumerated through the real drawing rules. Player 98.76%, Banker 98.94%, Tie 85.64%.",
    playable: true,
    tags: ["Table", "Cards"],
    art: "from-base-400/80 via-base-700 to-base-900",
    glyph: "◇",
    cover: "/games/baccarat.webp",
    popularity: 68,
    new: true,
  },
  {
    slug: "mines",
    name: "Mines",
    tagline: "Reveal safe cells, cash out before you hit one",
    category: "originals",
    rtp: 0.99,
    rtpNote: "Exactly 99% at every cash-out point — multiplier = 0.99 / exact hypergeometric survival odds.",
    playable: true,
    tags: ["Original", "Provably fair maths"],
    art: "from-red-800/50 via-base-700 to-base-900",
    glyph: "💣",
    cover: "/games/mines.webp",
    popularity: 93,
    new: true,
  },
  {
    slug: "hilo",
    name: "Hi-Lo",
    tagline: "Guess higher or lower, climb as far as you dare",
    category: "originals",
    rtp: 0.99,
    rtpNote: "Exactly 99% on every guess — odds recomputed from the real remaining deck at each step.",
    playable: true,
    tags: ["Original", "Cards", "Provably fair maths"],
    art: "from-sky-800/50 via-base-700 to-base-900",
    glyph: "🃏",
    cover: "/games/hilo.webp",
    popularity: 78,
    new: true,
  },
  {
    slug: "crash",
    name: "Crash",
    tagline: "Ride the curve, cash out before it breaks",
    category: "originals",
    rtp: 0.99,
    rtpNote: "Exactly 99% at every multiplier — the curve is priced so no target is better than another.",
    playable: true,
    tags: ["Originals", "Live curve"],
    art: "from-sky-600/50 via-base-700 to-base-900",
    glyph: "\u2197",
    cover: "/games/crash.webp",
    new: true,
    popularity: 96,
  },
  {
    slug: "towers",
    name: "Towers",
    tagline: "Climb a floor at a time, cash out whenever",
    category: "originals",
    rtp: 0.99,
    rtpNote: "Exactly 99% on every floor — the price is re-derived from the true odds at each step.",
    playable: true,
    tags: ["Originals", "Cash out"],
    art: "from-indigo-600/50 via-base-700 to-base-900",
    glyph: "\u25A6",
    cover: "/games/towers.webp",
    new: true,
    popularity: 91,
  },
  {
    slug: "video-poker",
    name: "Draw Poker",
    tagline: "Jacks or better — hold, draw, get paid",
    category: "table",
    rtp: null,
    rtpNote: "Depends on which cards you hold. Measured under a documented reference strategy — see the rules.",
    playable: true,
    tags: ["Table Games", "Decisions"],
    art: "from-rose-700/45 via-base-700 to-base-900",
    glyph: "\u2660",
    cover: "/games/video-poker.webp",
    new: true,
    popularity: 89,
  },
  {
    slug: "craps",
    name: "Craps",
    tagline: "Pass, don't pass, field — the real odds",
    category: "table",
    rtp: 0.985859,
    rtpNote: "98.586% on the pass line, 98.636% don't pass, 97.222% field — the real odds of the real game.",
    playable: true,
    tags: ["Table Games", "Dice"],
    art: "from-emerald-700/40 via-base-700 to-base-900",
    glyph: "\u2685",
    cover: "/games/craps.webp",
    new: true,
    popularity: 86,
  },
  {
    slug: "lottery",
    name: "Lottery",
    tagline: "Pick 6 of 49 and wait for the balls",
    category: "originals",
    rtp: 0.99,
    rtpNote: "Exactly 99% — the paytable is derived from the hypergeometric odds, not written by hand.",
    playable: true,
    tags: ["Originals", "Draw"],
    art: "from-purple-600/45 via-base-700 to-base-900",
    glyph: "\u25CF",
    cover: "/games/lottery.webp",
    new: true,
    popularity: 74,
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
  baccarat: "baccarat",
  mines: "mines",
  hilo: "hilo",
  "blackjack": "blackjack",
  "european-roulette": "roulette",
  dice: "dice",
  limbo: "limbo",
  coinflip: "coinflip",
  wheel: "wheel",
  plinko: "plinko",
  keno: "keno",
  "crash": "crash",
  "towers": "towers",
  "video-poker": "videopoker",
  "craps": "craps",
  "lottery": "lottery",
};

export const SLUG_FOR_ENGINE: Record<string, string> = {
  baccarat: "baccarat",
  mines: "mines",
  hilo: "hilo",
  blackjack: "blackjack",
  roulette: "european-roulette",
  dice: "dice",
  limbo: "limbo",
  coinflip: "coinflip",
  wheel: "wheel",
  plinko: "plinko",
  keno: "keno",
  crash: "crash",
  towers: "towers",
  videopoker: "video-poker",
  craps: "craps",
  lottery: "lottery",
};
