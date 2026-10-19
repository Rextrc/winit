import HeroCarousel from "@/components/HeroCarousel";
import CategoryTabs from "@/components/CategoryTabs";
import GameRow from "@/components/GameRow";
import BetFeed from "@/components/BetFeed";
import { PLAYABLE, gamesByCategory } from "@/lib/games/registry";

export const dynamic = "force-dynamic";

export default function HomePage() {

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
      <GameRow title="WinIt Games" games={PLAYABLE.filter((g) => g.category !== "table")} />
      <GameRow title="Table Games" games={gamesByCategory("table")} href="/category/table" />

      <div className="mt-2">
        <BetFeed title="Your recent bets" take={10} />
      </div>
    </>
  );
}
