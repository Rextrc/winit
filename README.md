# WinIt

A fully simulated casino, built as a portfolio project.

**Every balance in this app is fake.** There is no payment processing, no deposit path, no
withdrawal path and no conversion to real money anywhere in the codebase. Credit enters an account
in exactly two ways — the sign-up grant and the daily bonus — and both are hard-coded constants
the app mints for itself. No money ever enters from outside.

---

## Stack

| | |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Data | Prisma + SQLite |
| Auth | NextAuth credentials provider (username + password, JWT sessions, bcrypt hashes) |
| Randomness | Node `crypto` CSPRNG — `Math.random` is not used for any game outcome |

## Running it

```bash
cp .env.example .env      # then set NEXTAUTH_SECRET
npm install
npm run db:push           # creates prisma/dev.db from the schema
npm run dev               # http://localhost:3000
```

Create an account at `/signup` and you start with **100,000.00** play credits.

```bash
npm run rtp               # verifies the published RTP of every game
npm run build             # production build
```

## Deploying

`npm start` runs `prisma db push` before `next start`, so a fresh container
provisions its own schema on boot. That step is idempotent — on a restart with
an existing database it reports "already in sync" and leaves the data alone.
The Prisma CLI is a runtime dependency for exactly this reason: platforms that
prune devDependencies for production installs would otherwise fail to start.

Two environment variables are **required** in production, and the app 500s on
every route without them:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | e.g. `file:/data/winit.db` — see the persistence note below |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | your public URL; optional on platforms that set it for you |

`GET /api/health` is a dependency-free liveness probe — point your platform's
healthcheck at it rather than `/`, so a healthy process still reports healthy
while a dependency is degraded.

> **SQLite persistence — read this before deploying.** The container filesystem
> on most hosts is ephemeral, so a `DATABASE_URL` pointing inside the project
> directory (`file:./dev.db`) means **every redeploy wipes all accounts and
> balances**. The database must live on a mounted volume.

On Railway specifically:

1. Add a **Volume** to the service and set its mount path to `/data`.
2. Set `DATABASE_URL=file:/data/winit.db` (an absolute path on the volume, not
   a relative one).
3. Set `NEXTAUTH_SECRET`.
4. Point the healthcheck at `/api/health`.

### A note on `--accept-data-loss` in the start script

`npm start` runs `prisma db push --accept-data-loss` before booting, so a fresh volume
self-provisions and an existing one picks up schema changes without a manual step.

That flag is load-bearing right now: the money columns moved from `Int` to `BigInt`, and without it
`db push` refuses to run on a volume that already holds rows, which means the container never
starts. The cast itself is a widening one and is non-destructive — verified against a database
seeded on the old schema: balances, streaks and every transaction row survived intact, and the new
progression columns backfilled to level 1 / 0 XP / 0 rebirths.

The flag is not free, though. It suppresses the warning for genuinely destructive changes too, so a
future schema edit that drops or narrows a column would take the data with it silently. If this ever
carries data worth keeping, move to real migrations: generate them with `prisma migrate dev`, switch
the start script to `prisma migrate deploy`, and baseline the existing deployment first with
`prisma migrate resolve --applied <initial-migration>` (a database created by `db push` has no
`_prisma_migrations` table, so `migrate deploy` would otherwise fail with P3005).

On boot the start script creates the schema on the volume if it isn't there and
no-ops if it is, so the first deploy provisions itself and later ones leave the
data alone. Verified: an account and its transaction history survive a redeploy
with the balance intact.

---

## The games, and their real odds

Every game publishes the return-to-player it actually implements. `npm run rtp` proves it two
independent ways — closed-form enumeration/algebra, and a Monte-Carlo run through the exact same
functions the API calls — and exits non-zero if a paytable is edited without updating the published
figure.

The simulation tolerances are derived from each game's true variance (five standard errors), not
guessed. That matters: Roulette's variance is ~1, so a naive fixed ±1% band would be needlessly
loose for it, while Candy Cascade's cluster/cascade payouts are heavy-tailed enough that its check
uses a sanity band around the design target instead of a point estimate — see below for why that
game's RTP can't be pinned down any tighter than that in the first place.

### Candy Cascade (slots) — RTP ~96% (simulated)

A 7×7 grid, cluster pays instead of paylines: groups of 8 or more orthogonally adjacent matching
candies pay, the winners vanish, everything above falls to fill the gap, and fresh candies drop in
from the top — repeating until nothing new lines up. Every one of the 49 cells is drawn
independently via `crypto.randomInt`, including every refill after a tumble.

There is deliberately no wild in this game — clusters are pure same-symbol groups, so which cells
a cluster covers is never ambiguous.

Each cascade within a spin raises a shared multiplier along a fixed trail (1, 2, 3, 4, 5, 6, 8, 10,
12, 15, 20, 25, 50, 100×), and during the bonus round that multiplier keeps climbing across the
whole feature instead of resetting between spins. Landing 4+ lollipop scatters anywhere across a
spin's drops triggers 10–20 bonus spins; 3+ scatters during the bonus adds more.

**Buy Feature** skips straight to the bonus round for 14× the stake. Like the bonus
buys before it, the price is derived from the feature's own simulated expected value divided by the
base game's RTP, so buying it returns essentially the same percentage as triggering it naturally —
a shortcut, not an edge.

#### Why this RTP is measured, not exact

Every other game in WinIt publishes a closed-form RTP because its outcome space reduces to
something enumerable: a 9⁵ line-pay sum, a Binomial bucket count, a hypergeometric draw. A cluster
grid that can re-draw itself after every match — arbitrarily many times, each time raising the
stakes — has no such reduction. The outcome space is effectively unbounded, and there is no known
closed form for it. This isn't unique to WinIt: every real cluster-pays slot in the industry
publishes a *simulated* RTP (typically over billions of rounds), not an enumerated one.

WinIt does the same, just honestly labelled: `npm run rtp` runs `playRound()` — the exact function
the API calls — across 40,000+ full rounds (base spins, every cascade they trigger, and any bonus
round that follows) and reports the measured return with its confidence interval, checked against a
sanity band rather than a false-precision point value. It also checks the cluster evaluator
directly and independent of any RNG: a fully-matching grid resolves to one whole-board cluster, a
checkerboard never clusters, and a group below the minimum size never pays.

### European Roulette (roulette) — RTP 97.297% on every bet

European layout: 37 pockets, one green zero, no double zero. The winning pocket is one
`crypto.randomInt(37)` draw, taken *before* the wheel animation starts — the animation renders a
result that already exists.

Every bet pays true odds for the pockets it covers, so all of them return exactly **36/37**:

| Bet | Covers | Pays | Return |
|---|---|---|---|
| Straight up | 1/37 | 35:1 | 1 × 36 / 37 |
| Column, dozen | 12/37 | 2:1 | 12 × 3 / 37 |
| Red/black, odd/even, high/low | 18/37 | 1:1 | 18 × 2 / 37 |

House edge 2.703%, created by the green pocket and nothing else. No en prison, no la partage.

### Blackjack (blackjack) — RTP ≈99.4% with basic strategy

- 6 decks, crypto Fisher-Yates shuffled before **every** hand (so card counting gains nothing)
- Dealer stands on all 17, including soft 17
- Blackjack pays 3:2, winnings rounded down to the whole cent
- Double on any first two cards, one card only
- Split once on two cards of the same rank; split aces take one card each and cannot make blackjack
- No surrender, no insurance, no even money

House edge ≈0.6% under these rules. Unlike the other two figures this one depends on the player —
it is the ceiling reached with correct decisions, not an average over all play. The harness plays
200,000 hands with a compact basic strategy and lands around 99.2%.

The shoe lives server-side in the `Round` row. The browser receives only the cards it is entitled
to see; the dealer's hole card genuinely is not sent until the dealer plays.

### Baccarat (baccarat) — RTP Player 98.76% / Banker 98.94% / Tie 85.64%

Standard Punto Banco: an 8-deck shoe, reset fresh every hand, with **no player decisions** — the
third-card rules are entirely fixed by the two hands' totals, so a bet resolves in one request like
roulette rather than needing turn state like blackjack. Player and Banker pay 1:1 (Banker less the
standard 5% commission); Tie pays 8:1. A tie pushes a Player or Banker bet rather than losing it.

The odds are not textbook citations: `exactOdds()` in `src/lib/games/baccarat.ts` enumerates every
reachable sequence of card **point values** (suit never affects a baccarat outcome, so the state
space is 10 values, not 52 cards) through the real drawing rules, weighting each by its exact
multivariate-hypergeometric probability given the shoe's true composition and depletion order. The
result — Player 44.6247%, Banker 45.8597%, Tie 9.5156% to win — matches the published odds for this
game exactly, which is how `npm run rtp` confirms the enumeration is right rather than just
internally consistent.

### Mines (originals) — RTP exactly 99.00% at every cash-out point

1–24 mines are placed uniformly at random among 25 cells. Reveal cells one at a time; cash out any
time. Because mines are placed independently of reveal order, "the first *r* reveals are all safe"
has the same probability as "*r* uniformly random cells are all safe" — an exact hypergeometric
survival probability, `C(25−mines, r) / C(25, r)`. Paying `0.99 / P(survive r)` on cashing out after
*r* safe reveals makes the return exactly 99% for that decision, and — by the same optional-stopping
argument Limbo relies on — for whichever *r* a player actually stops at, reactively or not.

### Hi-Lo (originals, cards) — RTP exactly 99.00% on every guess

One 52-card deck, reshuffled every round. Guess whether the next card ranks higher or lower than the
one showing (a tie loses either way); cash out any time. Because it's a real deck with no
replacement, the exact count of remaining cards that would win each guess is known precisely at
every step from what has actually been dealt — no assumed distribution. The multiplier offered is
`0.99 / P(that guess wins)`, recomputed fresh each step; a direction with zero winning cards left is
disabled rather than offered at odds that can't pay.

Mines and Hi-Lo both use the `Round` table (the same one blackjack's hands live in) to hold state
between requests, since — unlike a one-shot bet — "cash out any time" needs the server to remember
where you are.

---

## Originals — Dice, Limbo, Coinflip, Wheel, Plinko, Keno, Mines, Hi-Lo

Eight games in this family. Six are instant-settle and share one formula; Mines and Hi-Lo add a cash-out-any-time step but reduce to the same idea per decision (see their own sections above):

```
multiplier = (1 - HOUSE_EDGE) / P(win)      HOUSE_EDGE = 0.01
```

Pick any target, any risk level, any number of Keno picks — the return is 99% by construction,
not by tuning. Multipliers are rounded to 4 decimal places before they are paid, and every
game's published RTP is recomputed from those rounded numbers, so the figure on the page is the
one the code actually pays, not the idealised formula.

| Game | How the odds are set | Exact RTP |
|---|---|---|
| **Dice** | Roll 00.00–99.99 (`crypto.randomInt(10000)`), bet over/under a target you choose. Win chance is restricted to 2%–98%. | 99.00% for every valid target |
| **Limbo** | A crash multiplier is drawn as `0.99 / u` for u uniform on (0,1], which has the exact property `P(result ≥ M) = 0.99 / M`. | 99.00% for every target |
| **Coinflip** | One `crypto.randomInt(2)` draw; the fairest possible statement of the formula. | 99.00% |
| **Wheel** | 10 equally-likely segments per risk level, multipliers summing to 9.9 — the mean is exactly 0.99 whichever risk you pick; risk only reshapes the distribution. | 99.00% at every risk level |
| **Plinko** | The ball takes 8/12/16 independent left-right bounces, so its bucket is Binomial(rows, ½). Bucket tables are fixed, but the RTP is computed by weighting each bucket by its true binomial probability — never assumed. | Exact per board, published in-game |
| **Keno** | 10 of 40 numbers drawn by an unbiased Fisher-Yates shuffle. The paytable for each pick count is *derived*: pays rise geometrically from the minimum paying hit count, then the row is scaled so the exact hypergeometric expectation lands on 99%. | 99.00% for any pick count |

`npm run rtp` checks every one of these exactly (closed-form probability sums, hit-probability and
bucket-probability distributions summing to 1) and empirically (a Monte-Carlo of the actual bounce
and draw processes for Plinko and Limbo).

Mines and Hi-Lo apply the identical `0.99 / P(win)` idea to a step-by-step game instead of a single
draw — see their sections above the `---` for the details specific to each.

## Life, levels and rebirth

Layered over the casino is a career ladder. It changes what you can bet, not what you win.

**XP comes from the amount staked, never from the amount won** — one XP per 1.00 wagered. That is
deliberate: progression tracks how much you played, so it cannot be farmed by a hot streak or
stalled by a cold one, and the house edge is never quietly adjusted to control your rate of climb.

**Levels raise your table limit.** Level 1 starts at 1,000.00 a bet; each level adds 30% of that
base, so level 50 sits at 15,700.00. Leveling pays no currency of its own — see below for why —
and each level-up still writes its own zero-value `LEVELUP` row so the history feed shows it.

There are 11 life stages across the 50 levels, from *Broke Student* to *Ready to Rebirth*, and four
unlocks along the way: turbo spins at 3, the Free Spins buy at 6, the Super Free Spins buy at 15,
and rebirth at 50.

**Rebirth** hands back your level in exchange for a permanent ×3 on every table limit you will ever
have, plus +50% XP so the climb back is faster. Anything unlocked in a past life stays unlocked. Up
to 10 rebirths, which puts the ceiling at 15,700.00 × 3¹⁰ = 927,069,300.00 a bet.

**Rebirth costs you the bankroll.** Everything above the 100,000.00 sign-up stake is surrendered and
does not come back: you restart the ladder at level 1 on beginner money with a far higher ceiling.
The wipe is `min(balance, starting stake)`, so it is a pure sink and can never hand anybody a cent —
an account that reaches level 50 already below the stake keeps exactly what it had rather than being
topped up to it. The surrendered amount is logged as the `betCents` of the `REBIRTH` row, because
the running balance has to explain itself.

**Neither leveling nor rebirth pays any currency.** They didn't always: an earlier version granted
chips on level-up and topped a rebirthing account's balance up to a floor. Both were a real exploit —
XP is earned on *amount staked*, not on winning, so a player betting the table limit on repeat, at
even the app's lowest house edge (blackjack's ~0.6%), came out net positive from leveling alone: the
guaranteed loss climbing the whole ladder once is about $7,900, against roughly $2.08M in level-up
rewards at the old rate. The rebirth floor was worse — deliberately losing everything before each of
the 10 allowed rebirths could extract up to $88.5M in free chips, bounded only by the rebirth cap.
Both credit paths are gone; the daily bonus is the only balance top-up in the app.

## The career: venues, the clock, and dying

Above the ladder sits a career. An account is not one gambler but a succession of them: you start at
18 with a stake, you play, you age, and one day you either run out of money or run out of years.

**The clock.** Every settled bet costs 15 days, win or lose, at every table in the app. A life runs
from 18 to 80 — 22,630 days — so a career is a budget of exactly 1,508 bets no matter how you spend
them. Nothing buys more of them.

**The circuit.** Seven rooms, from a folding table off Route 9 to somewhere with no name on the
door. A room changes three things and only three: the smallest stake its floor will take, the level
and bankroll its door wants to see, and the fare to get there. **It does not change the odds** —
every room deals the identical engine at the identical published RTP. A room that paid better would
either be free money or a trap, and either way it would make every RTP figure above meaningless.

Floors and fares are fractions of the player's *own* table limit rather than fixed sums, since the
limit already scales with level and multiplies with every rebirth. As a fraction, "the high rooms
want a fifth of your limit on the table" holds for a broke level 3 and a level 50 on their tenth
rebirth alike — and can never exceed the limit itself, which a fixed number silently could. The RTP
harness asserts exactly that, plus that the floors rise monotonically along the circuit.

**Ruin.** Falling below the global minimum stake means no room will deal to you. That is survivable
three times a life: each comeback hands back the sign-up stake and costs three years of the clock.
Out of comebacks and out of money, the career ends.

**Old age.** Reaching 22,630 days ends it too, whatever you are holding.

Either way the career freezes — every bet and every trip is refused — and a `Life` row is written:
cause, age, level, rebirths, peak balance, lifetime staked, bets placed, and an epitaph. These are
gravestones and are never updated.

**Starting again** resets balance, level, XP, rebirths, venue and comebacks. A retirement with a
large bankroll gives that bankroll up, which is the price of playing on rather than stopping while
ahead. What an heir inherits is a legacy: +25% XP per finished career and a slightly higher starting
level, capped at 10 — both worth exactly zero currency. The reset balance is the same fake sign-up
stake every account already gets, and reaching it costs an entire career first, making it a strictly
worse way to obtain fake credits than claiming the daily bonus. Like rebirth, the movement is logged
on the `NEWLIFE` row (surrendered as `betCents`, restored as `payoutCents`) so the ledger chain
stays exact — an earlier draft wrote it as a zero-value row and broke reconciliation, which the
reconciliation test caught.

## The progression layer: reputation, VIP, achievements, challenges, events

Four tracks run alongside the level ladder, and every one of them is evaluated
server-side from real data after each settled bet.

**Reputation** is per-life and is the only number in the app that can go DOWN.
It is earned on how much of your OWN table limit a bet represents, not on the
raw amount, so a level 3 player pushing their limit builds a name as fast as a
level 40 one and a whale betting the minimum builds none. Random events take it
back, and losing a tier can close a door you had already walked through.

**VIP** is the opposite: banked against lifetime amount staked, which no reset
ever clears, so it is the account's permanent record rather than the current
gambler's. A tier raises your table limit and your daily bonus. It never
touches the odds of a game — every published RTP above would become a lie the
moment a loyalty tier quietly paid better.

**Achievements** (43 of them, including four secrets) are pure predicates over
a statistics snapshot. Nothing is awarded by a route saying so: the whole list
is re-evaluated after every settled bet and an achievement unlocks the first
time its own predicate returns true, so they cannot drift out of sync with the
data and cannot be granted by a client asking nicely. The harness asserts that
a brand-new account has earned nothing, that a maxed one has earned everything
except the two secrets that are about NOT doing something, and that every
progress bar stays inside 0..1.

**Challenges** rotate daily and weekly, picked deterministically from the
period key so the board is the same for everyone and needs no stored
randomness. They are split by design, for the reason the level-up rewards were
removed:

| Objective | Pays |
|---|---|
| Volume — place N bets, stake X, try N games | XP and reputation **only** |
| Outcome — win N times, land a big multiplier | XP, reputation and currency |

Anything that pays currency for volume is free money bought by betting enough.
A volume challenge with a non-zero cash reward throws at module load, the claim
route re-checks it at the point of payment, and the harness asserts it too. The
most claimable in a day before rebirth scaling is 5,200.00 — bounded, and in
the same order as the daily bonus.

### Random events, and how they stay honest

After a settled bet an event can fire — sometimes something simply happens,
sometimes you are asked to decide and the decision moves money, reputation and
the clock. The outcome is always drawn on the server from the catalogue's own
weights; the client sends only which button was pressed.

Money here is held down by four rules:

1. **Every cent goes through the same ledger as a bet**, so the running-balance
   reconciliation that proves the books still passes. A 222-row history mixing
   bets, events and a challenge claim chains exactly onto the live balance.
2. **Effects are a fraction of the player's own table limit**, not of their
   balance and not a flat sum — a flat sum is life-changing at level 1 and
   invisible at level 50.
3. **An effect is also capped at 10x the stake that triggered it.** This closes
   the real hole, and the harness is what found it: events fire per settled bet
   regardless of size, so without this rule a player could grind the 0.10
   minimum two hundred times — losing almost nothing — and still draw eight
   events priced against a seven-figure table limit. With it, farming at the
   minimum is worth under 10.00 a day.
4. **The rate is capped at 8 events a day.** What bounds the faucet is not the
   best event in the catalogue but the WEIGHTED MEAN of the best choice across
   the pool you are eligible for, since you cannot choose which event fires.
   That comes to **-0.02 table limits per event for a new player and +0.099 for
   a veteran** — under one table limit a day at the cap, asserted for both.

An earlier version of that last check measured the single best event instead
and made a balanced catalogue look like a 24x-per-day exploit. The check was
wrong, but fixing it is what surfaced the stake-farming hole that was real.

## The staff dashboard

`/admin` is a separate surface for running the site: account support, game
configuration, promo codes, announcements, analytics and an audit log. It is
built around one rule.

**Authorisation lives on the server.** Every admin route names the capability
it needs and calls `requireStaff(capability)` before doing anything. The
dashboard hiding a button is a courtesy to the person using it, not a control:
a caller with a shell and a session cookie gets exactly the same 403 as a
caller who never saw the page. `scripts/security-check.ts` asserts this over
HTTP rather than by importing handlers, because the claim is about the server.

### Roles

Six roles, with capabilities written out per role in `src/lib/admin/roles.ts`
rather than derived from a hierarchy — so reading the file tells you what a
role can do, and widening one role cannot silently widen another.

| Role | What it is for |
| --- | --- |
| OWNER | Everything, including handing out roles. |
| ADMIN | Everything operational. Cannot create or demote staff. |
| DEVELOPER | Configuration, flags, test accounts, the economy behind them. Cannot suspend or delete a real player. |
| MODERATOR | Player conduct: view, suspend, announce. No economy, no configuration. |
| SUPPORT | Reads everything about an account, changes nothing. |
| TESTER | Views accounts and creates its own test accounts. |

Rank is separate from capability and does one job: staff cannot act on staff
at or above their own rank, which is what stops two ADMINs demoting each other
in a loop.

Roles are created by `npm run seed:owner` (`OWNER_USERNAME` + a 12-character
`OWNER_PASSWORD`) and nowhere else. There is no route, no sign-up flag and no
"first user becomes owner" rule: the dashboard can set balances and wipe
progression, so minting the first one has to live outside anything an HTTP
request can reach.

### What the dashboard cannot do

There is no field anywhere in `/api/admin/*` that reaches a paytable, a house
edge or an RNG. It can close a table and bound its stakes; it cannot re-price
one, because a dashboard that could would make every published RTP in this
README unverifiable.

Money is the same story: an admin adjustment moves through `credit`/`debit`
and writes a `Transaction` with `kind: "ADMIN"`, exactly like a bet. It never
writes `balanceCents` directly, so the running-balance reconciliation that
proves the books still holds across staff action.

Every mutation requires a reason of at least three characters, and the
dangerous ones (delete, balance.set, progression reset, role change,
maintenance mode) additionally require an explicit confirmation flag. The
audit row — actor, role, target, field, old value, new value, reason — is
written inside the same transaction as the change, so an action either happens
and is recorded or neither.

### Where players see it

Two dashboard sections write something a player actually reads, so both have a
player-facing half:

- **Announcements** land in the bell in the site header. A message with no
  target goes to everyone; one addressed to a username goes to that account
  alone. Read state is a row (`AnnouncementRead`), not browser storage, so a
  message a player has read stays read on their other devices.
- **Promo codes** are redeemed on the Rewards page. The form picks *what* a
  code grants from a dropdown — credits, XP or both — and the API refuses a
  code that grants neither, since that would redeem successfully and hand the
  player nothing. Redemption is one per account, enforced by a unique index
  rather than a read-then-write, and the credit goes through the ledger like
  any other.

### Reasons, and acting on yourself

Every mutating staff action still writes an audit entry with the old value, the
new value and a reason. Below OWNER the reason is mandatory. An OWNER may leave
it blank — they answer to nobody inside the app, so the text box is friction
rather than accountability — and the entry is written anyway, with the reason
field reading `No reason given (owner).` so the trail never has a silent gap.

Staff may also act on their own account: the rank rule exists to stop peers
overriding each other, and you are not your own peer. Three actions are refused
on yourself regardless of role — `suspend`, `delete` and `role.set` — because
roles can only be minted from the command line, so an owner who demoted himself
would have no way back in.

### The security check

```bash
npm run dev          # in one shell
npm run security     # in another
```

48 assertions over HTTP: anonymous and ordinary players refused on every admin
route; SUPPORT reading accounts but refused on the economy; MODERATOR able to
suspend but not to touch money or configure a game; ADMIN refused on role
changes; equal-rank staff unable to act on each other; missing reasons and
missing confirmations rejected; an OWNER grant landing as an `ADMIN` ledger row
that keeps the running-balance chain exact and an audit row carrying both
values; and suspension, a closed table and maintenance mode each actually
refusing a bet — with staff still able to bet during maintenance. It creates
its own throwaway accounts and deletes them afterwards.

## Architecture notes

```
src/lib/admin/roles.ts    roles, capabilities, rank
src/lib/admin/guard.ts    requireStaff / requireTarget — the authorisation boundary
src/lib/admin/audit.ts    append-only audit log
src/lib/admin/config.ts   site flags and per-game gates (never paytables)
src/lib/rng.ts            crypto CSPRNG helpers (rejection-sampled, no modulo bias)
src/lib/money.ts          integer-cent money, bet validation
src/lib/bigmoney.ts       the BigInt <-> number boundary, and the only place it happens
src/lib/progression.ts    XP curve, life stages, table limits, unlocks, rebirth rules
src/lib/life/career.ts    the clock, ruin, death causes, legacy — pure, no I/O
src/lib/life/venues.ts    the circuit: floors, doors and fares (never odds)
src/lib/life/reputation.ts per-life standing; the one number that can fall
src/lib/life/vip.ts       lifetime-staked ladder; limits and bonus, never odds
src/lib/life/achievements.ts 43 pure predicates over a stats snapshot
src/lib/life/challenges.ts daily/weekly boards; volume never pays currency
src/lib/life/events.ts    the random-event catalogue and its faucet bounds
src/lib/life/advance.ts   the progression pass that runs on every settled bet
src/lib/ledger.ts         the only place balance moves; atomic, conditional SQL updates
src/lib/bonus.ts          daily bonus cooldown + streak maths
src/lib/games/candy.ts    Candy Cascade's paytable, cluster evaluator and pay maths — pure
src/lib/games/*.engine.ts the randomness half, server only
src/lib/games/originals.ts shared fair-multiplier maths for Dice/Limbo/Coinflip/Wheel/Plinko/Keno
src/lib/games/*.ts        pure game engines — no I/O, directly testable
src/app/api/games/*       thin routes: validate -> run engine -> settle -> log
scripts/rtp.ts            RTP verification harness
```

**Money is integer cents.** No floating point anywhere in the ledger, so no drift can create or
destroy credits.

**Money columns are `BigInt`.** Prisma's `Int` is hard-capped at 2³¹ on SQLite — about 21.4M in
cents — which a rebirthed account would overflow, and Prisma fails the write rather than truncating.
The database therefore stores `BigInt`, while every layer above works in plain JS `number` cents
(exact to 2⁵³, roughly 90 trillion). `src/lib/bigmoney.ts` is the only conversion point, and it
throws rather than silently losing precision.

**The client is never trusted.** Bet amounts are revalidated server-side against the live balance
and against the player's own table limit — recomputed from the persisted level and rebirth count,
never taken from the request — on every request; bonus buys recheck their unlock server-side too; game outcomes are computed on the server; blackjack actions
are checked against the server's own list of legal moves for that hand.

**Balance changes are atomic.** Debits are conditional updates (`WHERE balanceCents >= ?`), so two
concurrent requests can never spend the same credits twice. The daily bonus uses the same trick on
`lastBonusAt` as its cooldown lock. Every settled bet writes exactly one `Transaction` row carrying
the stake, payout, net and the running balance it produced — the `/history` page reconciles from the
sign-up grant forward.

## Out of scope, deliberately

No payment processing. No real-money conversion. No multiplayer or leaderboard tied to anything
external. The "Live" category is styled tables that stream nowhere. Levels, rebirths and bonus buys are all
priced in the same fake currency as everything else — a bonus buy spends play chips, and there is no
code path anywhere that accepts real value for any of it.

If real gambling is causing harm to you or someone you know, support is available — in the US, the
National Problem Gambling Helpline is 1-800-522-4700.
