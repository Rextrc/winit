import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/auth";
import { capabilitiesOf, isRole, type Capability } from "@/lib/admin/roles";
import AdminNav from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";
export const metadata = { title: "WinIt — staff" };

/**
 * The dashboard shell.
 *
 * This guard keeps the pages from rendering for a non-staff visitor, but it is
 * NOT the security boundary — every admin API route re-checks the caller's
 * capability independently, so a hand-crafted request gets a 403 whether or not
 * it ever loaded a page here.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const id = await currentUserId();
  if (!id) redirect("/login?callbackUrl=/admin");

  const me = await prisma.user.findUnique({
    where: { id },
    select: { username: true, adminRole: true, suspendedAt: true, deletedAt: true },
  });

  if (!me || me.deletedAt || me.suspendedAt || !isRole(me.adminRole)) {
    // Straight back to the casino: a player has no reason to learn that this
    // area exists or what it would have shown.
    redirect("/");
  }

  const capabilities: Capability[] = capabilitiesOf(me.adminRole);

  return (
    <div className="min-h-screen bg-base-900">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-base-800/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-4 px-5 py-3">
          <Link href="/admin" className="flex items-baseline gap-2">
            <span className="font-display text-lg font-black tracking-tight text-white">WinIt</span>
            <span className="rounded bg-loss/20 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-loss">
              Staff
            </span>
          </Link>

          <AdminNav capabilities={capabilities} />

          <div className="ml-auto flex items-center gap-3 text-right">
            <div className="leading-tight">
              <p className="text-[12px] font-bold text-slate-100">{me.username}</p>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-volt">
                {me.adminRole}
              </p>
            </div>
            <Link href="/" className="btn-ghost px-3 py-1.5 text-xs">
              Exit to casino
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1500px] px-5 py-6">{children}</main>
    </div>
  );
}
