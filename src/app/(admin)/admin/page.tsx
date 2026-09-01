import AnalyticsPanel from "@/components/admin/AnalyticsPanel";

export const dynamic = "force-dynamic";

export default function AdminOverviewPage() {
  return (
    <>
      <h1 className="font-display mb-1 text-2xl font-black tracking-tight text-white">Overview</h1>
      <p className="mb-6 text-sm text-slate-400">
        Every figure here is a live query rather than a cached counter, so it is the truth as of the
        moment you asked.
      </p>
      <AnalyticsPanel />
    </>
  );
}
