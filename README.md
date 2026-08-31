# WinIt

A fully simulated casino, built as a portfolio project.

**Every balance in this app is fake.** There is no payment processing, no deposit path, no
withdrawal path and no conversion to real money anywhere in the codebase. The only two sources of
credit are the sign-up grant and the daily bonus, and both are hard-coded constants.

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

> **SQLite persistence.** The container filesystem on most hosts is ephemeral,
> so a `DATABASE_URL` pointing inside the project directory means every redeploy
> wipes all accounts and balances. Mount a persistent volume and point
> `DATABASE_URL` at a path on it (e.g. `file:/data/winit.db`), or move the
> datasource to Postgres.

---

## The games, and their real odds

Every game publishes the return-to-player it actually implements. `npm run rtp` proves it two
independent ways — closed-form enumeration/algebra, and a Monte-Carlo run through the exact same
functions the API calls — and exits non-zero if a paytable is edited without updating the published
figure.

The simulation tolerances are derived from each game's true variance (five standard errors), not
guessed. That matters: the slots payout has a standard deviation of 9.76× the stake because of the
1-in-110,592 jackpot, so even a million spins carries a ~0.98% standard error, and a fixed ±1% band
would false-alarm about a third of the time. Roulette's variance is ~1, so it gets a band an order
of magnitude tighter.

### Volt Reels (slots) — RTP 94.9788%

Three reels, one payline. Each reel independently draws one stop from the same 48-position virtual
strip via `crypto.randomInt(48)`, giving 48³ = 110,592 equally likely outcomes.

| Symbol | Strip slots | Three of a kind |
|---|---|---|
| Seven | 1 | ×2500 |
| Diamond | 2 | ×450 |
| Bell | 4 | ×150 |
| Bar | 6 | ×54 |
| Cherry | 8 | ×25 |
| Lemon | 12 | ×10 |
| Clover | 15 | ×5 |
| *any two cherries* | — | ×4 |

The RTP is not an estimate. `computeExactRtp()` enumerates all 110,592 combinations and sums the
payouts: **105,039 / 110,592 = 94.9788%**. There is no near-miss weighting, no held state between
spins, and no adjustment based on your balance or history.

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

## Architecture notes

```
src/lib/rng.ts            crypto CSPRNG helpers (rejection-sampled, no modulo bias)
src/lib/money.ts          integer-cent money, table limits, bet validation
src/lib/ledger.ts         the only place balance moves; atomic, conditional SQL updates
src/lib/bonus.ts          daily bonus cooldown + streak maths
src/lib/games/*.ts        pure game engines — no I/O, directly testable
src/app/api/games/*       thin routes: validate -> run engine -> settle -> log
scripts/rtp.ts            RTP verification harness
```

**Money is integer cents.** No floating point anywhere in the ledger, so no drift can create or
destroy credits.

**The client is never trusted.** Bet amounts are revalidated server-side against the live balance
and the table limits on every request; game outcomes are computed on the server; blackjack actions
are checked against the server's own list of legal moves for that hand.

**Balance changes are atomic.** Debits are conditional updates (`WHERE balanceCents >= ?`), so two
concurrent requests can never spend the same credits twice. The daily bonus uses the same trick on
`lastBonusAt` as its cooldown lock. Every settled bet writes exactly one `Transaction` row carrying
the stake, payout, net and the running balance it produced — the `/history` page reconciles from the
sign-up grant forward.

## Out of scope, deliberately

No payment processing. No real-money conversion. No multiplayer or leaderboard tied to anything
external. The "Live" category is styled tables that stream nowhere.

If real gambling is causing harm to you or someone you know, support is available — in the US, the
National Problem Gambling Helpline is 1-800-522-4700.
