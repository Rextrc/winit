# WinIt

A fully simulated casino, built as a portfolio project.

**Every balance in this app is fake.** There is no payment processing, no deposit path, no
withdrawal path and no conversion to real money anywhere in the codebase. Credit enters an account
in exactly four ways — the sign-up grant, the daily bonus, level-up rewards and the rebirth floor —
and every one of them is a hard-coded constant the app mints for itself. No money ever enters from
outside.

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
npm run rtp               # verifies the published RTP of all three games
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
guessed. That matters: a slots round has a payout standard deviation of ~3.9× the stake because of
the free-spins tail, so even a million rounds carries a ~0.39% standard error, and a fixed ±1% band
would false-alarm regularly. Roulette's variance is ~1, so it gets a band an order of magnitude
tighter.

### Volt Reels (slots) — RTP 94.9854%

Five reels, three rows, ten fixed paylines, wilds, scatters, a free-spins round that retriggers,
and two bonus buys.

Every one of the 15 visible cells is drawn independently from its own reel's 50-stop virtual strip
via `crypto.randomInt(50)`. That independence is the whole reason the RTP stays closed-form rather
than becoming a simulation estimate.

**Line pays** (multiple of the *line* bet; the stake is split across all ten lines, so it is
quantised down to a whole number of line bets and no payout is ever rounded):

| Symbol | 3 | 4 | 5 |
|---|---|---|---|
| Seven | ×40 | ×250 | ×1500 |
| Diamond | ×25 | ×100 | ×550 |
| Bell | ×15 | ×55 | ×250 |
| Bar | ×10 | ×32 | ×145 |
| Cherry | ×6 | ×20 | ×80 |
| Lemon | ×3 | ×12 | ×45 |
| Clover | ×3 | ×9 | ×30 |

**Wilds** sit on reels 2–4 only and substitute for any paying symbol. Because a wild can never lead
a line, there is no "which symbol does an all-wild line pay as" ambiguity to resolve.

**Scatters** pay on count anywhere in the grid, as a multiple of the *total* bet, and award free
spins at a ×2 multiplier. Three more scatters during the round adds five spins.

| Scatters | Pays | Free spins |
|---|---|---|
| 3 | ×2 | 10 |
| 4 | ×10 | 15 |
| 5 | ×50 | 20 |

**Bonus buys** are priced from their own exact expected value divided by the base game's RTP, then
rounded to a whole multiple of the stake — so buying the feature returns essentially the same
percentage as spinning for it. Free Spins costs 15× the stake, Super Free Spins (20 spins at ×3)
costs 45×, and both return 95.15% against the base game's 94.99%. The residual is published on the
button rather than hidden: a bonus buy is a shortcut, not an edge, in either direction.

#### Why the RTP is exact and not simulated

`exactRtp()` composes three closed-form pieces:

1. **Line pays.** A payline takes one cell from each reel, so a line is five independent draws, and
   its pay depends only on the five *symbol classes*. Enumerating all 9⁵ = 59,049 class tuples,
   weighted by their true probabilities, gives the exact expected line pay — 57.2243% per unit
   staked. All ten lines share a distribution and the stake is ten line bets, so that figure *is*
   the line RTP.
2. **Scatter pays.** With independent cells the scatter count is a sum of five Binomial(3, q)
   reels, computed exactly by convolution — 6.8958%.
3. **Free spins.** Each free spin independently retriggers with probability p, so the expected
   number of spins is the geometric series `N / (1 - 5p)`. The retrigger rate here is 0.1015, well
   under 1, so the series converges.

Total: **94.9854%**. `npm run rtp` re-derives all three, checks the scatter distribution sums to 1,
checks the paylines are well formed and the paytable monotonic, then Monte-Carlos a million full
rounds through the same `playRound()` the API calls — including a direct check of the realised
free-spins-per-round against the geometric series. Nothing is weighted by your balance, your
history, or how long you have been losing.

The game registry publishes `exactRtp()` itself rather than a copied constant, so the advertised
figure cannot drift from the paytable.

### Single Zero (roulette) — RTP 97.297% on every bet

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

### Twenty-One (blackjack) — RTP ≈99.4% with basic strategy

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

## Life, levels and rebirth

Layered over the casino is a career ladder. It changes what you can bet, not what you win.

**XP comes from the amount staked, never from the amount won** — one XP per 1.00 wagered. That is
deliberate: progression tracks how much you played, so it cannot be farmed by a hot streak or
stalled by a cold one, and the house edge is never quietly adjusted to control your rate of climb.

**Levels raise your table limit.** Level 1 starts at 1,000.00 a bet; each level adds 30% of that
base, so level 50 sits at 15,700.00. Every level also pays out fake chips worth five times the new
limit, and each level-up writes its own `LEVELUP` row so the ledger still reconciles from zero.

There are 11 life stages across the 50 levels, from *Broke Student* to *Ready to Rebirth*, and four
unlocks along the way: turbo spins at 3, the Free Spins buy at 6, the Super Free Spins buy at 15,
and rebirth at 50.

**Rebirth** hands back your level in exchange for a permanent ×3 on every table limit you will ever
have, plus +50% XP so the climb back is faster. Anything unlocked in a past life stays unlocked. Up
to 10 rebirths, which puts the ceiling at 15,700.00 × 3¹⁰ = 927,069,300.00 a bet.

Your balance is never reduced by a rebirth. The fresh stake is granted as a *floor*, so a player who
arrives rich keeps what they have — the cost of a rebirth is the level reset, not the money. Like
every other credit here, that grant is fake currency the app mints for itself; it is still not a
deposit, a purchase or a conversion.

## Architecture notes

```
src/lib/rng.ts            crypto CSPRNG helpers (rejection-sampled, no modulo bias)
src/lib/money.ts          integer-cent money, bet validation
src/lib/bigmoney.ts       the BigInt <-> number boundary, and the only place it happens
src/lib/progression.ts    XP curve, life stages, table limits, unlocks, rebirth rules
src/lib/ledger.ts         the only place balance moves; atomic, conditional SQL updates
src/lib/bonus.ts          daily bonus cooldown + streak maths
src/lib/games/slots.ts    paytable, evaluator and exact RTP — pure, safe to import client-side
src/lib/games/*.engine.ts the randomness half, server only
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
