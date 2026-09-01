import { notFound } from "next/navigation";
import { ENGINE_KEY, gameBySlug } from "@/lib/games/registry";
import CandyGame from "@/components/games/CandyGame";
import BlackjackGame from "@/components/games/BlackjackGame";
import RouletteGame from "@/components/games/RouletteGame";
import DiceGame from "@/components/games/DiceGame";
import LimboGame from "@/components/games/LimboGame";
import CoinflipGame from "@/components/games/CoinflipGame";
import WheelGame from "@/components/games/WheelGame";
import PlinkoGame from "@/components/games/PlinkoGame";
import KenoGame from "@/components/games/KenoGame";
import BaccaratGame from "@/components/games/BaccaratGame";
import MinesGame from "@/components/games/MinesGame";
import HiloGame from "@/components/games/HiloGame";

export const dynamic = "force-dynamic";

export default function GamePage({ params }: { params: { slug: string } }) {
  const game = gameBySlug(params.slug);
  if (!game || !game.playable) notFound();

  switch (ENGINE_KEY[game.slug]) {
    case "slots":
      return <CandyGame game={game} />;
    case "blackjack":
      return <BlackjackGame game={game} />;
    case "roulette":
      return <RouletteGame game={game} />;
    case "dice":
      return <DiceGame game={game} />;
    case "limbo":
      return <LimboGame game={game} />;
    case "coinflip":
      return <CoinflipGame game={game} />;
    case "wheel":
      return <WheelGame game={game} />;
    case "plinko":
      return <PlinkoGame game={game} />;
    case "keno":
      return <KenoGame game={game} />;
    case "baccarat":
      return <BaccaratGame game={game} />;
    case "mines":
      return <MinesGame game={game} />;
    case "hilo":
      return <HiloGame game={game} />;
    default:
      notFound();
  }
}
