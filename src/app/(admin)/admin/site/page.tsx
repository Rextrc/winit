import SitePanel from "@/components/admin/SitePanel";

export const dynamic = "force-dynamic";

export default function AdminSitePage() {
  return (
    <>
      <h1 className="font-display mb-1 text-2xl font-black tracking-tight text-white">Site</h1>
      <p className="mb-6 text-sm text-slate-400">
        Maintenance mode, feature flags, announcements and promo codes.
      </p>
      <SitePanel />
    </>
  );
}
