import LifePanel from "@/components/LifePanel";

export const dynamic = "force-dynamic";

export const metadata = { title: "Life — WinIt" };

export default function LifePage() {
  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-black tracking-tight text-white">Your life</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          You start at 18 with a stake and play until you run out of money or out of years. Staking
          raises your level, levels open better rooms and a bigger ceiling, and a rebirth trades the
          whole ladder — and your bankroll — for a permanent multiplier on that ceiling. Every bet
          costs the same slice of the clock, and when the clock stops, someone else sits down.
        </p>
      </header>

      <LifePanel />
    </>
  );
}
