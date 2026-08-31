import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/auth";
import SignupForm from "@/components/SignupForm";
import { formatCents, STARTING_BALANCE_CENTS } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  if (await currentUserId()) redirect("/");

  return (
    <div className="panel p-6">
      <h1 className="font-display text-2xl font-black tracking-tight text-white">Create an account</h1>
      <p className="mt-1 text-sm text-slate-400">
        Start with{" "}
        <span className="num font-bold text-volt">{formatCents(STARTING_BALANCE_CENTS)}</span> play credits.
        Nothing here costs anything.
      </p>

      <div className="mt-6">
        <SignupForm />
      </div>

      <p className="mt-5 text-center text-sm text-slate-400">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-volt hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
