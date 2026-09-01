import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string };
}) {
  if (await currentUserId()) redirect("/");

  const callbackUrl = searchParams.callbackUrl;
  const signupHref = callbackUrl ? `/signup?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/signup";

  return (
    <div className="panel p-6">
      <h1 className="font-display text-2xl font-black tracking-tight text-white">Welcome back</h1>
      <p className="mt-1 text-sm text-slate-400">
        {callbackUrl
          ? "Sign in to place that bet — browsing never needs an account."
          : "Sign in to pick up your play-money balance."}
      </p>

      <div className="mt-6">
        <LoginForm />
      </div>

      <p className="mt-5 text-center text-sm text-slate-400">
        No account?{" "}
        <Link href={signupHref} className="font-semibold text-volt hover:underline">
          Create one — it&apos;s free and fake
        </Link>
      </p>
    </div>
  );
}
