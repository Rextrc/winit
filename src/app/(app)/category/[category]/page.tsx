import { notFound } from "next/navigation";
import GameTile from "@/components/GameTile";
import { CATEGORY_LABELS, gamesByCategory, type Category } from "@/lib/games/registry";

export const dynamic = "force-dynamic";

const VALID: Category[] = ["slots", "table", "live", "originals"];

const BLURBS: Record<Category, string> = {
  slots: "Weighted reel strips, published paytables, exact enumerated RTP.",
  table: "Blackjack and roulette dealt from crypto-shuffled decks and true-odds wheels.",
  live: "Simulated studio tables. Nothing here streams anywhere — this is a portfolio build.",
  originals: "House-built game ideas. Most of these are still in the workshop.",
};

export default function CategoryPage({ params }: { params: { category: string } }) {
  const category = params.category as Category;
  if (!VALID.includes(category)) notFound();

  const games = gamesByCategory(category);

  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-black tracking-tight text-white">
          {CATEGORY_LABELS[category]}
        </h1>
        <p className="mt-1 text-sm text-slate-400">{BLURBS[category]}</p>
      </header>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {games.map((g) => (
          <div key={g.slug} className="[&>*]:!w-full">
            <GameTile game={g} />
          </div>
        ))}
      </div>

      {games.length === 0 && <p className="text-sm text-slate-500">Nothing in this category yet.</p>}
    </>
  );
}
