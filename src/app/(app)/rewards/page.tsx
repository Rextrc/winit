import { redirect } from "next/navigation";
import ClaimBonusButton from "@/components/ClaimBonusButton";
import BetFeed from "@/components/BetFeed";
import RedeemCode from "@/components/RedeemCode";
import ReferralPanel from "@/components/ReferralPanel";
import { currentUser } from "@/lib/auth";
import { bonusAmountForStreak, bonusStatus } from "@/lib/bonus";
import {
  BONUS_COOLDOWN_MS,
  DAILY_BONUS_CENTS,
  MAX_BONUS_STREAK,
  STARTING_BALANCE_CENTS,
  formatCents,
} from "@/lib/money";
import { IconRewards } from "@/components/Icons";

export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  const user = await currentUser();
  // The lobby and every game are open to anyone; this page has nothing to
  // show without an account, so it gates itself here instead.
  if (!user) redirect("/login?callbackUrl=/rewards");
  const status = bonusStatus(user.lastBonusAt, user.bonusStreak);

  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-black tracking-tight text-white">Rewards</h1>
        <p className="mt-1 text-sm text-slate-400">
          The daily bonus, promo codes and referrals are the only ways credits enter your balance
          after sign-up.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="panel p-6 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-volt">
                <IconRewards className="h-4 w-4" />
                Daily bonus
              </p>
              <p className="num mt-2 text-4xl font-black text-white">
                {formatCents(status?.amountCents ?? DAILY_BONUS_CENTS)}
              </p>
              <p className="mt-1 text-sm text-slate-400">
                {status?.claimable
                  ? `Ready to claim — this will be day ${status.nextStreak} of your streak.`
                  : "Come back when the timer runs out to keep your streak alive."}
              </p>
            </div>

            <div className="min-w-[160px]">
              <ClaimBonusButton full />
            </div>
          </div>

          <div className="mt-6">
            <p className="label">Streak ladder</p>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: MAX_BONUS_STREAK }, (_, i) => i + 1).map((day) => {
                const reached = (user?.bonusStreak ?? 0) >= day;
                return (
                  <div
                    key={day}
                    className={`flex-1 rounded-xl border px-2 py-2.5 text-center ${
                      reached ? "border-volt/40 bg-volt/10" : "border-white/5 bg-base-900/50"
                    }`}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Day {day}</p>
                    <p className={`num mt-0.5 text-[12px] font-black ${reached ? "text-volt" : "text-slate-300"}`}>
                      {formatCents(bonusAmountForStreak(day))}
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              Claims unlock every {BONUS_COOLDOWN_MS / (60 * 60 * 1000)} hours. Miss 48 hours and the
              streak resets to day 1. The ladder caps at day {MAX_BONUS_STREAK}.
            </p>
          </div>
        </div>

        <div className="space-y-4">
        <ReferralPanel />

        <RedeemCode />

        <div className="panel p-6">
          <h3 className="text-[13px] font-black tracking-tight text-white">Where credits come from</h3>
          <ul className="mt-3 space-y-3 text-[12px] leading-relaxed text-slate-400">
            <li>
              <span className="font-bold text-slate-200">Sign-up grant</span> — a one-off{" "}
              {formatCents(STARTING_BALANCE_CENTS)} when you create an account.
            </li>
            <li>
              <span className="font-bold text-slate-200">Daily bonus</span> — the button above.
            </li>
            <li>
              <span className="font-bold text-slate-200">Promo codes</span> — redeemed above, once
              each.
            </li>
            <li>
              <span className="font-bold text-slate-200">Referrals</span> — when someone signs up
              with your code.
            </li>
            <li>
              <span className="font-bold text-slate-200">Winning bets</span> — paid out of the same
              fake ledger.
            </li>
          </ul>
          <p className="mt-4 rounded-xl border border-white/5 bg-base-900/60 p-3 text-[11px] leading-relaxed text-slate-500">
            That is the complete list. WinIt has no payment integration, no deposit endpoint and no
            way to convert a balance into anything outside this app — by design, not by omission.
          </p>
        </div>
        </div>
      </div>

      <div className="mt-4">
        <BetFeed title="Credit history" take={20} />
      </div>
    </>
  );
}
