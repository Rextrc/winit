import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ENGINE_KEY, gameBySlug } from "@/lib/games/registry";
import { IconLive } from "@/components/Icons";
import { pageMetadata } from "@/lib/metadata";
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
import CrashGame from "@/components/games/CrashGame";
import TowersGame from "@/components/games/TowersGame";
import VideoPokerGame from "@/components/games/VideoPokerGame";
import CrapsGame from "@/components/games/CrapsGame";
import SicBoGame from "@/components/games/SicBoGame";
import ScratchGame from "@/components/games/ScratchGame";
import LotteryGame from "@/components/games/LotteryGame";
import RacingGame from "@/components/games/RacingGame";
import WarGame from "@/components/games/WarGame";
import ThreeCardGame from "@/components/games/ThreeCardGame";

export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const game = gameBySlug(params.slug);
  if (!game) return { title: "Game not found" };
  return pageMetadata(
    game.name,
    game.playable
      ? `${game.tagline} ${game.rtp !== null ? `Published RTP ${(game.rtp * 100).toFixed(2)}%.` : game.rtpNote}`
      : `${game.tagline} ${game.rtpNote}`,
  );
}

export default function GamePage({ params }: { params: { slug: string } }) {
  const game = gameBySlug(params.slug);
  // A slug that isn't in the registry at all is a genuine 404. One that is —
  // Studio One and Studio Two, today — is a game the lobby already shows and
  // labels honestly as not built yet; landing here by typing the URL should
  // find the same honest answer, not a blank Next.js error page.
  if (!game) notFound();
  if (!game.playable) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-white/5 text-slate-500">
          <IconLive className="h-6 w-6" />
        </div>
        <h1 className="font-display text-2xl font-black tracking-tight text-white">{game.name}</h1>
        <p className="mt-2 text-sm text-slate-400">{game.tagline}</p>
        <p className="mt-4 rounded-xl border border-white/5 bg-base-900/60 p-4 text-[13px] leading-relaxed text-slate-500">
          {game.rtpNote}
        </p>
        <Link href={`/category/${game.category}`} className="btn-ghost mt-6 inline-flex px-5 py-2.5 text-sm">
          Back to {game.category}
        </Link>
      </div>
    );
  }

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
    case "crash":
      return <CrashGame game={game} />;
    case "towers":
      return <TowersGame game={game} />;
    case "videopoker":
      return <VideoPokerGame game={game} />;
    case "craps":
      return <CrapsGame game={game} />;
    case "sicbo":
      return <SicBoGame game={game} />;
    case "scratch":
      return <ScratchGame game={game} />;
    case "lottery":
      return <LotteryGame game={game} />;
    case "racing":
      return <RacingGame game={game} />;
    case "war":
      return <WarGame game={game} />;
    case "threecard":
      return <ThreeCardGame game={game} />;
    default:
      notFound();
  }
}
