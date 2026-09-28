import type { MarketKey, SportEvent } from "@/lib/sports/types";

/**
 * Presentation metadata for sports and leagues: icons, labels, where a league
 * is played, how a match is divided up. Client-safe.
 */

export type SportIconKey =
  | "popular"
  | "soccer"
  | "americanfootball"
  | "basketball"
  | "baseball"
  | "icehockey"
  | "tennis"
  | "mma"
  | "boxing"
  | "cricket"
  | "rugby"
  | "aussierules"
  | "lacrosse"
  | "golf"
  | "other";

const GROUP_ICON: Record<string, SportIconKey> = {
  Soccer: "soccer",
  "American Football": "americanfootball",
  Basketball: "basketball",
  Baseball: "baseball",
  "Ice Hockey": "icehockey",
  Tennis: "tennis",
  "Mixed Martial Arts": "mma",
  Boxing: "boxing",
  Cricket: "cricket",
  "Rugby League": "rugby",
  "Rugby Union": "rugby",
  "Aussie Rules": "aussierules",
  Lacrosse: "lacrosse",
  Golf: "golf",
};

export function iconForGroup(group: string): SportIconKey {
  return GROUP_ICON[group] ?? "other";
}

/** Order of the sport tile rail — the rest follow alphabetically. */
export const GROUP_ORDER = [
  "Soccer",
  "American Football",
  "Basketball",
  "Tennis",
  "Baseball",
  "Ice Hockey",
  "Mixed Martial Arts",
  "Boxing",
  "Cricket",
  "Rugby League",
  "Rugby Union",
  "Aussie Rules",
];

/** Leagues shown on the Featured tab, in priority order; the first few active ones are used. */
export const FEATURED_LEAGUES = [
  "soccer_uefa_champs_league",
  "soccer_epl",
  "americanfootball_nfl",
  "basketball_nba",
  "soccer_uefa_nations_league",
  "soccer_spain_la_liga",
  "icehockey_nhl",
  "baseball_mlb",
  "soccer_fifa_world_cup",
  "americanfootball_ncaaf",
  "mma_mixed_martial_arts",
  "soccer_italy_serie_a",
  "soccer_germany_bundesliga",
];
export const FEATURED_LIMIT = 4;

type Region = { name: string; flag: string | null };

const INTERNATIONAL: Region = { name: "International", flag: null };

/** Where a league is played, for the "England / Premier League" panel header. */
const LEAGUE_REGION: [RegExp, Region][] = [
  [/^soccer_(uefa|fifa|conmebol|concacaf|africa|asia)/, INTERNATIONAL],
  [/^soccer_(epl|efl|fa_cup|england)/, { name: "England", flag: "gb-eng" }],
  [/^soccer_spl/, { name: "Scotland", flag: "gb-sct" }],
  [/^soccer_spain/, { name: "Spain", flag: "es" }],
  [/^soccer_germany/, { name: "Germany", flag: "de" }],
  [/^soccer_italy/, { name: "Italy", flag: "it" }],
  [/^soccer_france/, { name: "France", flag: "fr" }],
  [/^soccer_netherlands/, { name: "Netherlands", flag: "nl" }],
  [/^soccer_portugal/, { name: "Portugal", flag: "pt" }],
  [/^soccer_belgium/, { name: "Belgium", flag: "be" }],
  [/^soccer_turkey/, { name: "Türkiye", flag: "tr" }],
  [/^soccer_greece/, { name: "Greece", flag: "gr" }],
  [/^soccer_austria/, { name: "Austria", flag: "at" }],
  [/^soccer_switzerland/, { name: "Switzerland", flag: "ch" }],
  [/^soccer_denmark/, { name: "Denmark", flag: "dk" }],
  [/^soccer_sweden/, { name: "Sweden", flag: "se" }],
  [/^soccer_norway/, { name: "Norway", flag: "no" }],
  [/^soccer_finland/, { name: "Finland", flag: "fi" }],
  [/^soccer_poland/, { name: "Poland", flag: "pl" }],
  [/^soccer_league_of_ireland/, { name: "Ireland", flag: "ie" }],
  [/^soccer_brazil/, { name: "Brazil", flag: "br" }],
  [/^soccer_argentina/, { name: "Argentina", flag: "ar" }],
  [/^soccer_chile/, { name: "Chile", flag: "cl" }],
  [/^soccer_mexico/, { name: "Mexico", flag: "mx" }],
  [/^soccer_usa|^soccer_mls/, { name: "USA", flag: "us" }],
  [/^soccer_japan/, { name: "Japan", flag: "jp" }],
  [/^soccer_korea/, { name: "South Korea", flag: "kr" }],
  [/^soccer_china/, { name: "China", flag: "cn" }],
  [/^soccer_australia/, { name: "Australia", flag: "au" }],
  [/^soccer_saudi/, { name: "Saudi Arabia", flag: "sa" }],
  [/^(americanfootball|basketball_(nba|ncaab|wnba)|baseball_mlb|icehockey_nhl|lacrosse)/, { name: "USA", flag: "us" }],
  [/^americanfootball_cfl/, { name: "Canada", flag: "ca" }],
  [/^basketball_(euroleague|eurocup)/, INTERNATIONAL],
  [/^baseball_npb/, { name: "Japan", flag: "jp" }],
  [/^baseball_kbo/, { name: "South Korea", flag: "kr" }],
  [/^icehockey_sweden/, { name: "Sweden", flag: "se" }],
  [/^icehockey_liiga/, { name: "Finland", flag: "fi" }],
  [/^(aussierules|rugbyleague_nrl)/, { name: "Australia", flag: "au" }],
  [/^cricket_ipl/, { name: "India", flag: "in" }],
  [/^cricket_big_bash/, { name: "Australia", flag: "au" }],
];

export function leagueRegion(sportKey: string): Region {
  for (const [re, region] of LEAGUE_REGION) if (re.test(sportKey)) return region;
  return INTERNATIONAL;
}

/** Region for the odds request — one region per request keeps each call cheap. */
export function oddsRegionFor(sportKey: string): "us" | "eu" | "uk" {
  if (/nfl|ncaaf|cfl|nba|ncaab|wnba|mlb|nhl|mma|boxing|mls|lacrosse/.test(sportKey)) return "us";
  if (/^(cricket|rugby)/.test(sportKey)) return "uk";
  return "eu";
}

export function hasDraw(group: string): boolean {
  return group === "Soccer" || group === "Cricket" || group === "Rugby Union" || group === "Rugby League";
}

export function marketLabel(key: MarketKey, group: string): string {
  if (key === "h2h") {
    if (group === "Soccer") return "1x2";
    if (group === "Baseball") return "Winner (incl. extra innings)";
    if (group === "Mixed Martial Arts" || group === "Boxing") return "Fight winner";
    if (group === "Tennis") return "Match winner";
    if (hasDraw(group)) return "Match result";
    return "Winner (incl. overtime)";
  }
  if (key === "spreads") {
    if (group === "Soccer") return "Asian handicap";
    if (group === "Ice Hockey") return "Puck line";
    if (group === "Baseball") return "Run line";
    if (group === "Basketball" || group === "American Football") return "Point spread";
    return "Handicap";
  }
  if (group === "Soccer" || group === "Ice Hockey") return "Total goals";
  if (group === "Baseball") return "Total runs";
  if (group === "Tennis") return "Total games";
  if (group === "Mixed Martial Arts" || group === "Boxing") return "Total rounds";
  return "Total points";
}

export function marketTab(key: MarketKey): string {
  return key === "h2h" ? "Winner" : key === "spreads" ? "Handicap" : "Total";
}

/** How a match is divided, for the scoreboard's timeline. */
export function periodsFor(group: string): { marks: string[]; halfway?: number; note: string } | null {
  switch (group) {
    case "Soccer":
      return { marks: ["15'", "30'", "45'", "60'", "75'", "90'"], halfway: 2, note: "(2x45 Min) FT" };
    case "American Football":
      return { marks: ["Q1", "Q2", "Q3", "Q4"], halfway: 1, note: "(4x15 Min) FT" };
    case "Basketball":
      return { marks: ["Q1", "Q2", "Q3", "Q4"], halfway: 1, note: "(4x12 Min) FT" };
    case "Ice Hockey":
      return { marks: ["P1", "P2", "P3"], note: "(3x20 Min) FT" };
    case "Baseball":
      return { marks: ["1", "2", "3", "4", "5", "6", "7", "8", "9"], note: "9 innings" };
    case "Mixed Martial Arts":
    case "Boxing":
      return { marks: ["R1", "R2", "R3"], note: "Rounds" };
    case "Tennis":
      return { marks: ["S1", "S2", "S3"], note: "Sets" };
    default:
      return null;
  }
}

export type Surface = "grass" | "court" | "ice" | "hard" | "canvas";

export function surfaceFor(group: string): Surface {
  if (group === "Basketball") return "court";
  if (group === "Ice Hockey") return "ice";
  if (group === "Tennis") return "hard";
  if (group === "Mixed Martial Arts" || group === "Boxing") return "canvas";
  return "grass";
}

/** A short code for a team: "Chicago Bears" → "CHI", "Latvia" → "LAT". */
export function teamAbbr(name: string, other?: string): string {
  const code = (n: string) => n.replace(/[^A-Za-zÀ-ÿ ]/g, "").trim().slice(0, 3).toUpperCase();
  const mine = code(name);
  if (!other || code(other) !== mine) return mine;
  // Same city, different club — fall back to initials.
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return initials.length >= 2 ? initials.slice(0, 3) : mine;
}

/** The main-line market (1x2 / winner) for lobby rows. */
export function mainMarket(event: SportEvent) {
  return event.markets.find((m) => m.key === "h2h") ?? null;
}

/** Order h2h outcomes home, draw, away — the way every sportsbook lists them. */
export function orderH2h<T extends { name: string }>(outcomes: T[], home: string, away: string): T[] {
  const rank = (n: string) => (n === home ? 0 : n === "Draw" ? 1 : n === away ? 2 : 3);
  return [...outcomes].sort((a, b) => rank(a.name) - rank(b.name));
}

/** Count of selections beyond the ones a lobby row shows — the "+N" badge. */
export function extraSelections(event: SportEvent): number {
  let total = 0;
  for (const m of event.markets) for (const l of m.lines) total += l.outcomes.length;
  const shown = mainMarket(event)?.lines[0]?.outcomes.length ?? 0;
  return Math.max(0, total - shown);
}

export function formatPoint(point: number | null, signed: boolean): string {
  if (point === null) return "";
  if (!signed) return String(point);
  return point > 0 ? `+${point}` : String(point);
}

/** "Chicago Bears -3.5", "Over 2.5", "Draw". */
export function selectionLabel(market: MarketKey, name: string, point: number | null): string {
  if (market === "h2h" || point === null) return name;
  return `${name} ${formatPoint(point, market === "spreads")}`;
}
