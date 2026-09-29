import { can } from "@/lib/admin/roles";
import { staffViewer } from "@/lib/admin/viewer";
import SportsAdminPanel from "@/components/admin/SportsAdminPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sports" };

export default async function AdminSportsPage() {
  const me = await staffViewer();
  const canManage = me ? can(me.role, "sports.manage") : false;

  return (
    <>
      <h1 className="font-display mb-1 text-2xl font-black tracking-tight text-white">Sports</h1>
      <p className="mb-6 max-w-3xl text-sm text-slate-400">
        Real matches settle themselves against the real final score every five minutes on their own —
        this page is for watching that happen, and for the two things it can&apos;t do by itself: run a
        settlement pass early, or void a bet the feed will never resolve (a dropped event, bad data).
      </p>
      <SportsAdminPanel canManage={canManage} />
    </>
  );
}
