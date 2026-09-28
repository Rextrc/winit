"use client";

import { useSlip } from "@/components/sports/SlipProvider";
import { legId, type MarketKey, type SportEvent } from "@/lib/sports/types";
import TeamBadge from "@/components/sports/TeamBadge";

type Props = {
  event: SportEvent;
  market: MarketKey;
  name: string;
  point: number | null;
  price: number;
  /** What the button says above the price. */
  label: string;
  /** "tile" stacks label over price (lobby); "row" puts them side by side (match page). */
  layout?: "tile" | "row";
  /** Show the team's badge in a row layout. */
  badge?: string;
  disabled?: boolean;
};

export default function OddsButton({ event, market, name, point, price, label, layout = "tile", badge, disabled }: Props) {
  const slip = useSlip();
  const id = legId({ eventId: event.id, market, name, point });
  const selected = slip.has(id);

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    slip.toggle({
      eventId: event.id,
      sportKey: event.sportKey,
      leagueTitle: event.leagueTitle,
      group: event.group,
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
      commenceTime: event.commenceTime,
      market,
      name,
      point,
      price,
    });
  };

  const tone = disabled
    ? "cursor-not-allowed bg-[#0c0d10] opacity-50"
    : selected
      ? "bg-brand shadow-[0_0_0_1px_rgba(167,139,255,0.6)_inset]"
      : "bg-[#0c0d10] hover:bg-[#17191f]";

  if (layout === "row") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={selected}
        className={`flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3.5 text-left transition-colors ${tone}`}
      >
        <span className="flex min-w-0 items-center gap-3">
          {badge && <TeamBadge team={badge} shape="round" className="h-6 w-6" />}
          <span className="truncate text-[15px] text-white">{label}</span>
        </span>
        <span className={`num shrink-0 text-[15px] font-bold ${selected ? "text-white" : "text-[#9d7aff]"}`}>
          {price.toFixed(2)}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`flex min-w-0 flex-col items-start rounded-lg px-4 py-3 text-left transition-colors ${tone}`}
    >
      <span className="w-full truncate text-[14px] text-white">{label}</span>
      <span className={`num mt-1 text-[15px] font-bold ${selected ? "text-white" : "text-[#9d7aff]"}`}>{price.toFixed(2)}</span>
    </button>
  );
}
