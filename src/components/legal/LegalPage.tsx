import type { ReactNode } from "react";

/** Shared chrome for the Terms and Privacy pages — a plain-language legal read in the site's own voice. */
export function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl pb-16">
      <h1 className="font-display text-2xl font-black tracking-tight text-white">{title}</h1>
      <p className="mt-1 text-[12px] text-slate-500">Last updated {updated}</p>
      <p className="mt-4 text-[13px] leading-relaxed text-slate-400">{intro}</p>
      <div className="mt-6 space-y-6">{children}</div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel p-6">
      <h2 className="text-[14px] font-black tracking-tight text-white">{title}</h2>
      <div className="prose-legal mt-2 space-y-2 text-[13px] leading-relaxed text-slate-400">{children}</div>
    </section>
  );
}

/** The one fact every page in this app repeats, because it's the one that matters. */
export function NoCashValueNotice() {
  return (
    <div className="rounded-2xl border border-gold/30 bg-gold/[0.06] p-5">
      <p className="text-[13px] font-black uppercase tracking-wide text-gold">No cash value</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-slate-300">
        Every balance, chip, credit and multiplier in WinIt is play money and exists only inside this app. It has no
        cash value, cannot be purchased, redeemed, exchanged, transferred, or won for real money, cryptocurrency,
        goods, or any prize of value — now or ever. There is no deposit path and no withdrawal path anywhere in
        WinIt.
      </p>
    </div>
  );
}
