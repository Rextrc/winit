import { PICKS, POOL } from "@/lib/games/lottery";

/**
 * Quick Pick for the browser. The server's `quickPick` draws from Node's
 * crypto module, which doesn't exist client-side — calling it there threw and
 * left the button dead. A player's own ticket only needs to be unbiased, not
 * secret, so this shuffles with the Web Crypto equivalent. The DRAW is still
 * the server's.
 */
export function browserQuickPick(): number[] {
  const pool = Array.from({ length: POOL }, (_, i) => i + 1);
  const buf = new Uint32Array(1);
  for (let i = pool.length - 1; i > 0; i--) {
    // Rejection sampling, so the modulo can't favour small indices.
    const limit = Math.floor(0x1_0000_0000 / (i + 1)) * (i + 1);
    let r: number;
    do {
      crypto.getRandomValues(buf);
      r = buf[0];
    } while (r >= limit);
    const j = r % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, PICKS).sort((a, b) => a - b);
}
