/**
 * Display names for the ledger's `game` key — the engine key a transaction
 * was written under ("roulette", "videopoker", "sicbo", ...), not the URL
 * slug. Shared by the bet feed and the win-share page so the two can never
 * disagree about what to call a game.
 */
export const GAME_LABELS: Record<string, string> = {
  slots: "Candy Cascade",
  blackjack: "Blackjack",
  roulette: "European Roulette",
  dice: "Dice",
  limbo: "Limbo",
  coinflip: "Coinflip",
  wheel: "Wheel",
  plinko: "Plinko",
  keno: "Keno",
  baccarat: "Baccarat",
  mines: "Mines",
  hilo: "Hi-Lo",
  crash: "Crash",
  towers: "Towers",
  videopoker: "Draw Poker",
  craps: "Craps",
  sicbo: "Sic Bo",
  scratch: "Scratch Cards",
  lottery: "Lottery",
  racing: "Silks",
  war: "War",
  threecard: "Three Card",
  bonus: "Daily bonus",
  signup: "Welcome grant",
  life: "Life",
};
