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

A 7×7 grid, cluster pays instead of paylines: groups of 5 or more orthogonally adjacent matching
candies pay, the winners vanish, everything above falls to fill the gap, and fresh candies drop in
from the top — repeating until nothing new lines up. Every one of the 49 cells is drawn
independently via `crypto.randomInt`, including every refill after a tumble.

There is deliberately no wild in this game — clusters are pure same-symbol groups, so which cells
a cluster covers is never ambiguous.

Each cascade within a spin raises a shared multiplier along a fixed trail (1, 2, 3, 4, 5, 6, 8, 10,
12, 15, 20, 25, 50, 100×), and during the bonus round that multiplier keeps climbing across the
whole feature instead of resetting between spins. Landing 4+ lollipop scatters anywhere across a
spin's drops triggers 10–20 bonus spins; 3+ scatters during the bonus adds more.

**Buy Feature** skips straight to the bonus round for 11× the stake. Like the bonus
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

---

## Originals — Dice, Limbo, Coinflip, Wheel, Plinko, Keno

Six instant-settle games built on one shared formula rather than six separate paytables:

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

Your balance is never touched by a rebirth, win or lose — only the level and rebirth count reset.

**Neither leveling nor rebirth pays any currency.** They didn't always: an earlier version granted
chips on level-up and topped a rebirthing account's balance up to a floor. Both were a real exploit —
XP is earned on *amount staked*, not on winning, so a player betting the table limit on repeat, at
even the app's lowest house edge (blackjack's ~0.6%), came out net positive from leveling alone: the
guaranteed loss climbing the whole ladder once is about $7,900, against roughly $2.08M in level-up
rewards at the old rate. The rebirth floor was worse — deliberately losing everything before each of
the 10 allowed rebirths could extract up to $88.5M in free chips, bounded only by the rebirth cap.
Both credit paths are gone; the daily bonus is the only balance top-up in the app.

## Architecture notes

```
src/lib/rng.ts            crypto CSPRNG helpers (rejection-sampled, no modulo bias)
src/lib/money.ts          integer-cent money, bet validation
src/lib/bigmoney.ts       the BigInt <-> number boundary, and the only place it happens
src/lib/progression.ts    XP curve, life stages, table limits, unlocks, rebirth rules
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
