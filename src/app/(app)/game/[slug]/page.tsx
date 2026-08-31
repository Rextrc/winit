import { notFound } from "next/navigation";
import { ENGINE_KEY, gameBySlug } from "@/lib/games/registry";
import SlotsGame from "@/components/games/SlotsGame";
import BlackjackGame from "@/components/games/BlackjackGame";
import RouletteGame from "@/components/games/RouletteGame";

export const dynamic = "force-dynamic";

export default function GamePage({ params }: { params: { slug: string } }) {
  const game = gameBySlug(params.slug);
  if (!game || !game.playable) notFound();

  switch (ENGINE_KEY[game.slug]) {
    case "slots":
      return <SlotsGame game={game} />;
    case "blackjack":
      return <BlackjackGame game={game} />;
    case "roulette":
      return <RouletteGame game={game} />;
    default:
      notFound();
  }
}
