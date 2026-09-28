/** Shapes shared by the sports API routes and the client. No server imports. */

export type MarketKey = "h2h" | "spreads" | "totals";

export type Outcome = {
  /** A team name, "Draw", "Over" or "Under". */
  name: string;
  price: number;
  /** That outcome's own handicap (spreads) or the line (totals). */
  point: number | null;
};

/** One line of a market: the whole of h2h, or one handicap/total. */
export type MarketLine = {
  point: number | null;
  outcomes: Outcome[];
};

export type Market = {
  key: MarketKey;
  /** Lines ordered main-line first. */
  lines: MarketLine[];
};

export type SportEvent = {
  id: string;
  sportKey: string;
  leagueTitle: string;
  group: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  /** How many bookmakers the consensus prices were drawn from. */
  bookmakers: number;
  markets: Market[];
};

export type League = {
  key: string;
  title: string;
  group: string;
};

export type Catalog = {
  groups: { name: string; leagues: League[] }[];
};

export type LeagueEvents = {
  league: League;
  events: SportEvent[];
  fetchedAt: string | null;
};

/** A selection in the slip — everything the server needs to re-price it. */
export type SlipLeg = {
  eventId: string;
  sportKey: string;
  leagueTitle: string;
  group: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  market: MarketKey;
  name: string;
  point: number | null;
  price: number;
};

export function legId(l: Pick<SlipLeg, "eventId" | "market" | "name" | "point">): string {
  return `${l.eventId}|${l.market}|${l.name}|${l.point ?? ""}`;
}

export type MyBetLeg = {
  id: string;
  eventId: string;
  sportKey: string;
  leagueTitle: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  market: MarketKey;
  selection: string;
  point: number | null;
  priceDecimal: number;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
};

export type MyBet = {
  id: string;
  kind: "SINGLE" | "MULTI";
  stakeCents: number;
  priceDecimal: number;
  payoutCents: number | null;
  status: string;
  createdAt: string;
  settledAt: string | null;
  legs: MyBetLeg[];
};
