import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/auth";
import { formatCents, formatSignedCents } from "@/lib/money";
import { fromDb } from "@/lib/bigmoney";
import { GAME_LABELS } from "@/lib/gameLabels";
import { pageMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata("Leaderboard", "This week's biggest winners on WinIt.");

const DAY = 86_400_000;

/** Monday 00:00 UTC of the current week — the board resets then. */
function weekStart(now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  return new Date(d.getTime() - dow * DAY);
}

function hue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

function Avatar({ name }: { name: string }) {
  const h = hue(name);
  return (
    <span
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[11px] font-black text-base-900"
      style={{ background: `linear-gradient(140deg, hsl(${h} 70% 62%), hsl(${(h + 48) % 360} 70% 45%))` }}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

const MEDALS = ["bg-amber-400 text-base-900", "bg-slate-300 text-base-900", "bg-orange-400 text-base-900"];

export default async function LeaderboardPage() {
  const me = await currentUserId();
  const since = weekStart();
  const resetsIn = since.getTime() + 7 * DAY - Date.now();
  const days = Math.floor(resetsIn / DAY);
  const hours = Math.floor((resetsIn % DAY) / 3_600_000);

  const eligible = { kind: "BET", createdAt: { gte: since }, user: { isGuest: false, bannedAt: null, deletedAt: null } };

  const [profitRows, bigWins] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["userId"],
      where: eligible,
      _sum: { netCents: true, betCents: true },
      _count: true,
      orderBy: { _sum: { netCents: "desc" } },
      take: 25,
    }),
    prisma.transaction.findMany({
      where: { ...eligible, netCents: { gt: 0 } },
      orderBy: { netCents: "desc" },
      take: 10,
      select: { id: true, game: true, netCents: true, betCents: true, payoutCents: true, user: { select: { username: true } } },
    }),
  ]);

  const users = await prisma.user.findMany({
    where: { id: { in: profitRows.map((r) => r.userId) } },
    select: { id: true, username: true },
  });
  const nameOf = new Map(users.map((u) => [u.id, u.username]));

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black tracking-tight text-white">Weekly leaderboard</h1>
          <p className="mt-1 text-sm text-slate-400">Most profit this week. Everyone starts from zero every Monday.</p>
        </div>
        <span className="rounded-full border border-volt/30 bg-volt/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-volt">
          Resets in {days}d {hours}h
        </span>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="panel p-4 lg:col-span-2">
          <h2 className="mb-3 text-[13px] font-black tracking-tight text-white">Top profit</h2>
          {profitRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">No bets yet this week — the top spot is open.</p>
          ) : (
            <ol className="space-y-1.5">
              {profitRows.map((r, i) => {
                const name = nameOf.get(r.userId) ?? "player";
                const net = fromDb(r._sum.netCents ?? BigInt(0));
                return (
                  <li
                    key={r.userId}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${r.userId === me ? "border border-volt/40 bg-volt/10" : "bg-white/[0.02]"}`}
                  >
                    <span className={`num grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-black ${MEDALS[i] ?? "bg-white/5 text-slate-400"}`}>
                      {i + 1}
                    </span>
                    <Avatar name={name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-white">
                        {name}
                        {r.userId === me && <span className="ml-1.5 text-[11px] font-bold text-volt">you</span>}
                      </span>
                      <span className="num block text-[11px] text-slate-500">
                        {r._count} bets · {formatCents(fromDb(r._sum.betCents ?? BigInt(0)))} wagered
                      </span>
                    </span>
                    <span className={`num text-sm font-black ${net >= 0 ? "text-win" : "text-loss"}`}>{formatSignedCents(net)}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="panel p-4">
          <h2 className="mb-3 text-[13px] font-black tracking-tight text-white">Biggest wins</h2>
          {bigWins.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">Nothing yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {bigWins.map((w) => {
                const bet = fromDb(w.betCents);
                const mult = bet > 0 ? fromDb(w.payoutCents) / bet : 0;
                return (
                  <li key={w.id} className="flex items-center gap-2.5 rounded-xl bg-white/[0.02] px-3 py-2">
                    <Avatar name={w.user.username} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold text-white">{w.user.username}</span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {GAME_LABELS[w.game] ?? w.game} · {mult.toFixed(2)}x
                      </span>
                    </span>
                    <span className="num text-[13px] font-black text-win">{formatSignedCents(fromDb(w.netCents))}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
