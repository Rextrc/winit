import LifePanel from "@/components/LifePanel";

export const dynamic = "force-dynamic";

export const metadata = { title: "Life — WinIt" };

export default function LifePage() {
  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-black tracking-tight text-white">Your life</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          A career built out of play money. Staking raises your level, levels raise the ceiling on
          what you can put on one bet, and a rebirth trades the whole ladder for a permanent
          multiplier on that ceiling.
        </p>
      </header>

      <LifePanel />
    </>
  );
}
