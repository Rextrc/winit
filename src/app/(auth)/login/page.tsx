import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentUserId()) redirect("/");

  return (
    <div className="panel p-6">
      <h1 className="font-display text-2xl font-black tracking-tight text-white">Welcome back</h1>
      <p className="mt-1 text-sm text-slate-400">Sign in to pick up your play-money balance.</p>

      <div className="mt-6">
        <LoginForm />
      </div>

      <p className="mt-5 text-center text-sm text-slate-400">
        No account?{" "}
        <Link href="/signup" className="font-semibold text-volt hover:underline">
          Create one — it&apos;s free and fake
        </Link>
      </p>
    </div>
  );
}
