import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/auth";
import AchievementsPanel from "@/components/life/AchievementsPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Achievements — WinIt" };

export default async function AchievementsPage() {
  if (!(await currentUserId())) redirect("/login?callbackUrl=/achievements");

  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-black tracking-tight text-white">Achievements</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Every one of these is a statement about your account that is either true or not. The whole
          list is re-checked against your real statistics after each settled bet, so nothing here can
          drift out of step with what you have actually done.
        </p>
      </header>

      <AchievementsPanel />
    </>
  );
}
