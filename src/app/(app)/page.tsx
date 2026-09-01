import HeroCarousel from "@/components/HeroCarousel";
import CategoryTabs from "@/components/CategoryTabs";
import GameRow from "@/components/GameRow";
import BetFeed from "@/components/BetFeed";
import { GAMES, PLAYABLE, gamesByCategory } from "@/lib/games/registry";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const fresh = GAMES.filter((g) => g.new);

  return (
    <>
      <HeroCarousel />
      <CategoryTabs />

      {/*
       * With 13 games total, a "Popular" row sorted across the whole catalog
       * was just every game again in a different order — the four category
       * rows below already cover all of them once, grouped by what they are.
       * "New" stays because it means something different: a short, curated
       * list of what actually shipped recently, not everything.
       */}
      {fresh.length > 0 && <GameRow title="New" subtitle="Just added to the lobby" games={fresh} />}
      <GameRow title="Slots" games={gamesByCategory("slots")} href="/category/slots" />
      <GameRow title="Table Games" games={gamesByCategory("table")} href="/category/table" />
      <GameRow title="Originals" games={gamesByCategory("originals")} href="/category/originals" />
      <GameRow title="Live" subtitle="Simulated tables — nothing streams anywhere" games={gamesByCategory("live")} href="/category/live" />

      <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <BetFeed title="Your recent bets" take={10} />
        </div>

        <div className="panel p-5">
          <h3 className="text-[13px] font-black tracking-tight text-white">Published odds</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
            Every game here publishes its real return-to-player. The maths in the code is the maths on
            this page — nothing is tuned against you behind the scenes.
          </p>

          <ul className="mt-4 space-y-2">
            {PLAYABLE.map((g) => (
              <li key={g.slug}>
                <Link
                  href={`/game/${g.slug}`}
                  className="flex items-center justify-between rounded-xl border border-white/5 px-3 py-2.5 transition hover:border-volt/30"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-slate-100">{g.name}</span>
                    <span className="block truncate text-[11px] text-slate-500">{g.rtpNote}</span>
                  </span>
                  <span className="num ml-3 shrink-0 text-sm font-black text-volt">
                    {g.rtp === null ? "—" : `${(g.rtp * 100).toFixed(2)}%`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-4 rounded-xl border border-white/5 bg-base-900/60 p-3 text-[11px] leading-relaxed text-slate-500">
            Play money only. Balance comes from the sign-up grant and the daily bonus — there is no
            deposit, no withdrawal and no payment code in this project.
          </p>
        </div>
      </div>
    </>
  );
}
