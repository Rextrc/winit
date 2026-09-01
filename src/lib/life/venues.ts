/**
 * WINIT — THE CIRCUIT
 * ---------------------------------------------------------------------------
 * The rooms a career passes through, from a card table behind a petrol station
 * to somewhere with no name on the door.
 *
 * A venue changes three things and only three things:
 *
 *   1. THE FLOOR      — the smallest stake the room will take.
 *   2. THE DOOR       — the level and bankroll you need to get in.
 *   3. THE TICKET     — what it costs to travel there.
 *
 * It does NOT change the odds. Every room deals the identical engine at the
 * identical published RTP, because the alternative — a room that pays better
 * — would either be free money or a trap, and both would make the RTP figures
 * printed on every game in this app meaningless. What a bigger room actually
 * costs you is that you can no longer bet small in it, so variance per bet
 * goes up while your life expectancy in bets stays exactly the same.
 *
 * Floors and tickets are expressed as fractions of the player's OWN table
 * limit rather than as fixed sums. That is deliberate: the limit already
 * scales with level and multiplies with every rebirth, so a fixed floor would
 * be an impassable wall early and a rounding error later. As a fraction, "the
 * high rooms want a fifth of your limit on the table" stays true for a broke
 * level 3 and for a level 50 on their tenth rebirth — and it can never exceed
 * the limit itself, which a fixed number silently could.
 * ---------------------------------------------------------------------------
 */

export type Venue = {
  id: string;
  name: string;
  city: string;
  blurb: string;
  /** Career level the door staff want to see. */
  minLevel: number;
  /** Bankroll the door staff want to see, in cents. */
  minBankrollCents: number;
  /** Table minimum, as a fraction of the player's own table limit. */
  tableMinFraction: number;
  /** Cost of getting there, as a multiple of the player's own table limit. */
  travelCostMultiple: number;
  /** Tailwind gradient for the venue card. */
  art: string;
};

export const VENUES: Venue[] = [
  {
    id: "back-room",
    name: "The Back Room",
    city: "Off Route 9",
    blurb: "A folding table, a strip light and a man who counts out loud. Nobody here is winning.",
    minLevel: 1,
    minBankrollCents: 0,
    tableMinFraction: 0,
    travelCostMultiple: 0,
    art: "from-slate-700/50 via-base-700 to-base-900",
  },
  {
    id: "delta-queen",
    name: "The Delta Queen",
    city: "Riverboat, Memphis",
    blurb: "Carpet the colour of an old bruise and a paddle wheel that hasn't turned in decades.",
    minLevel: 5,
    minBankrollCents: 250_000, // 2,500.00
    tableMinFraction: 0.005,
    travelCostMultiple: 0.5,
    art: "from-amber-800/40 via-base-700 to-base-900",
  },
  {
    id: "neon-mile",
    name: "Neon Mile",
    city: "Reno",
    blurb: "Open since 1961 and lit like it. Free coffee, no clocks, and a buffet you should not risk.",
    minLevel: 12,
    minBankrollCents: 2_500_000, // 25,000.00
    tableMinFraction: 0.02,
    travelCostMultiple: 1,
    art: "from-fuchsia-800/40 via-base-700 to-base-900",
  },
  {
    id: "grand-meridian",
    name: "The Grand Meridian",
    city: "Las Vegas",
    blurb: "Marble, a piano nobody is listening to, and a host who already knows your name.",
    minLevel: 20,
    minBankrollCents: 15_000_000, // 150,000.00
    tableMinFraction: 0.05,
    travelCostMultiple: 2,
    art: "from-sky-700/50 via-base-700 to-base-900",
  },
  {
    id: "salle-blanche",
    name: "Salle Blanche",
    city: "Monte Carlo",
    blurb: "Jacket required. The room is quiet because everyone in it is concentrating very hard.",
    minLevel: 28,
    minBankrollCents: 100_000_000, // 1,000,000.00
    tableMinFraction: 0.1,
    travelCostMultiple: 4,
    art: "from-indigo-700/50 via-base-700 to-base-900",
  },
  {
    id: "jade-terrace",
    name: "Jade Terrace",
    city: "Cotai, Macau",
    blurb: "Forty floors of it. The junket that brought you up here would like a word about your limit.",
    minLevel: 36,
    minBankrollCents: 1_000_000_000, // 10,000,000.00
    tableMinFraction: 0.2,
    travelCostMultiple: 8,
    art: "from-emerald-800/30 via-base-700 to-base-900",
  },
  {
    id: "the-vault",
    name: "The Vault",
    city: "Undisclosed",
    blurb: "No signage, no windows, no published limits. You were invited, which is its own warning.",
    minLevel: 45,
    minBankrollCents: 10_000_000_000, // 100,000,000.00
    tableMinFraction: 0.35,
    travelCostMultiple: 15,
    art: "from-rose-900/40 via-base-700 to-base-900",
  },
];

export const DEFAULT_VENUE_ID = VENUES[0].id;

export function venueById(id: string): Venue {
  return VENUES.find((v) => v.id === id) ?? VENUES[0];
}

/** The smallest stake this room will take, given the player's own limit. */
export function tableMinCents(venue: Venue, maxBetCents: number, floorCents: number): number {
  return Math.max(floorCents, Math.round(maxBetCents * venue.tableMinFraction));
}

/** What the ticket costs, given the player's own limit. */
export function travelCostCents(venue: Venue, maxBetCents: number): number {
  return Math.round(maxBetCents * venue.travelCostMultiple);
}

export type DoorCheck = { open: true } | { open: false; reason: string };

/** Whether the door opens, and if not, what is missing. */
export function doorCheck(venue: Venue, level: number, balanceCents: number): DoorCheck {
  if (level < venue.minLevel) {
    return { open: false, reason: `They want to see level ${venue.minLevel}. You are level ${level}.` };
  }
  if (balanceCents < venue.minBankrollCents) {
    return { open: false, reason: "Your bankroll is short of what this room expects to see." };
  }
  return { open: true };
}
