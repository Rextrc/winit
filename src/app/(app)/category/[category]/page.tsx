import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/metadata";
import GameTile from "@/components/GameTile";
import { CATEGORY_LABELS, gamesByCategory, type Category } from "@/lib/games/registry";
import CategoryTabs from "@/components/CategoryTabs";

export const dynamic = "force-dynamic";

const VALID: Category[] = ["table", "live", "originals"];

const BLURBS: Record<Category, string> = {
  table: "Blackjack and roulette dealt from crypto-shuffled decks and true-odds wheels.",
  live: "Simulated studio tables. Nothing here streams anywhere — this is a portfolio build.",
  originals: "House-built game ideas — every one playable, every paytable derived rather than guessed.",
};

export function generateMetadata({ params }: { params: { category: string } }): Metadata {
  const category = params.category as Category;
  if (!VALID.includes(category)) return { title: "Not found" };
  return pageMetadata(CATEGORY_LABELS[category], BLURBS[category]);
}

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

      <CategoryTabs />

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
