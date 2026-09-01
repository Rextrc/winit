import GameConfigPanel from "@/components/admin/GameConfigPanel";
import { staffViewer } from "@/lib/admin/viewer";

export const dynamic = "force-dynamic";

export default async function AdminGamesPage() {
  const me = await staffViewer();
  return (
    <>
      <h1 className="font-display mb-1 text-2xl font-black tracking-tight text-white">Games</h1>
      <p className="mb-6 max-w-3xl text-sm text-slate-400">
        Close a table or bound its stakes without a redeploy. Note what is deliberately absent: there
        is no control here that reaches a paytable, a house edge or an RNG — a dashboard that could
        quietly re-price a game would make every published RTP in this project unverifiable.
      </p>
      <GameConfigPanel role={me?.role ?? null} />
    </>
  );
}
