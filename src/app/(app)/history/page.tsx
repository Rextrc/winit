import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/auth";
import { formatCents, formatSignedCents } from "@/lib/money";
import HistoryTable from "@/components/HistoryTable";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const userId = await currentUserId();
  if (!userId) return null;

  const [rows, aggregate] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.transaction.aggregate({
      where: { userId, kind: "BET" },
      _sum: { betCents: true, payoutCents: true, netCents: true },
      _count: true,
    }),
  ]);

  const staked = aggregate._sum.betCents ?? 0;
  const returned = aggregate._sum.payoutCents ?? 0;
  const net = aggregate._sum.netCents ?? 0;
  const actualRtp = staked > 0 ? returned / staked : null;

  const stats = [
    { label: "Bets placed", value: aggregate._count.toLocaleString(), tone: "" },
    { label: "Total staked", value: formatCents(staked), tone: "" },
    { label: "Total returned", value: formatCents(returned), tone: "" },
    {
      label: "Net",
      value: formatSignedCents(net),
      tone: net > 0 ? "text-win" : net < 0 ? "text-loss" : "",
    },
    {
      label: "Your realised RTP",
      value: actualRtp === null ? "—" : `${(actualRtp * 100).toFixed(2)}%`,
      tone: "text-volt",
    },
  ];

  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-black tracking-tight text-white">Transaction log</h1>
        <p className="mt-1 text-sm text-slate-400">
          Every bet and every credit, with the running balance it produced.
        </p>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="panel p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{s.label}</p>
            <p className={`num mt-1 text-lg font-black text-white ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <HistoryTable
        rows={rows.map((t) => ({
          id: t.id,
          game: t.game,
          kind: t.kind,
          betCents: t.betCents,
          payoutCents: t.payoutCents,
          netCents: t.netCents,
          outcome: t.outcome,
          summary: t.summary,
          balanceAfterCents: t.balanceAfterCents,
          createdAt: t.createdAt.toISOString(),
        }))}
      />

      <p className="mt-4 text-[11px] leading-relaxed text-slate-600">
        Your realised RTP is returned ÷ staked across every settled bet. Over a short session it will
        swing a long way from the published figures — that is variance, not a different game.
      </p>
    </>
  );
}
