/**
 * Real team crests, looked up by name from TheSportsDB's free public API —
 * no key required, and it covers clubs across soccer, the big four US
 * leagues, and most others this book lists. Kept server-side and cached in
 * memory so the same team name (seen across many events/pages) costs one
 * outbound request, not one per lookup.
 */

const TTL_MS = 24 * 60 * 60 * 1000;
/** A miss (no crest found, or the lookup failed) is retried sooner — the
 * name might just be spelled differently next time, or the API might have
 * been down for a moment. */
const MISS_TTL_MS = 60 * 60 * 1000;

type Entry = { url: string | null; at: number };

const cache = new Map<string, Entry>();

export async function lookupCrest(team: string): Promise<string | null> {
  const key = team.trim().toLowerCase();
  if (!key) return null;

  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < (hit.url ? TTL_MS : MISS_TTL_MS)) return hit.url;

  let url: string | null = null;
  try {
    const res = await fetch(`https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(team)}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = (await res.json()) as { teams?: { strTeamBadge?: string; strTeamLogo?: string }[] };
      const first = data.teams?.[0];
      url = first?.strTeamBadge || first?.strTeamLogo || null;
    }
  } catch {
    url = null;
  }

  cache.set(key, { url, at: now });
  return url;
}
