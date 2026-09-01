import SitePanel from "@/components/admin/SitePanel";
import { staffViewer } from "@/lib/admin/viewer";

export const dynamic = "force-dynamic";

export default async function AdminSitePage() {
  const me = await staffViewer();
  return (
    <>
      <h1 className="font-display mb-1 text-2xl font-black tracking-tight text-white">Site</h1>
      <p className="mb-6 text-sm text-slate-400">
        Maintenance mode, feature flags, announcements and promo codes.
      </p>
      <SitePanel role={me?.role ?? null} />
    </>
  );
}
