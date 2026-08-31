import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="px-6 py-5">
        <Link href="/login" aria-label="WinIt">
          <Wordmark />
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">{children}</div>
      </div>

      <footer className="px-6 pb-6 text-center text-[11px] leading-relaxed text-slate-600">
        WinIt is a simulation built as a portfolio project. Every balance is fake.
        <br />
        There is no deposit, no withdrawal and no real-money path anywhere in this app.
      </footer>
    </div>
  );
}
