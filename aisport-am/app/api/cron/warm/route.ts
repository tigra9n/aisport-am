import { getLiveMatches } from "../../../../lib/live-football-server";
import { getLiveMatchDetailsV2 } from "../../../../lib/live-match-details-v2";

export const dynamic = "force-dynamic";

// Proactively warms the per-match detail cache (events/lineups/statistics)
// for yesterday's and today's tracked-league matches, so that by the time a
// real visitor opens a popup the data is already sitting in D1 — a flaky
// upstream fetch here just gets retried on the next cron tick instead of
// ever being visible to a user.
export async function GET(request: Request) {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;
  const url = new URL(request.url);
  if (url.searchParams.get("token") !== runtime.CRON_TOKEN || !runtime.CRON_TOKEN) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const results: { date: string; matches: number }[] = [];
  const warmed: string[] = [];
  const MAX_PER_RUN = 8;

  const candidates: { id: string; priority: number }[] = [];
  for (const offset of [-1, 0]) {
    const { matches } = await getLiveMatches(offset, true);
    results.push({ date: String(offset), matches: matches.length });
    for (const match of matches) {
      // Skip matches that haven't started yet — there's nothing to warm.
      if (!match.isLive && match.homeScore === null && match.awayScore === null) continue;
      // Live matches change fastest, so they benefit most from warming; give them priority.
      candidates.push({ id: match.id, priority: match.isLive ? 0 : 1 });
    }
  }
  candidates.sort((a, b) => a.priority - b.priority);

  // BUG FIXED: Array.sort is stable, so on a day with more live/started
  // candidates than MAX_PER_RUN (easily the case now that Champions/Europa/
  // Conference League, Saudi Pro League, and MLS are all tracked alongside
  // the top-5 domestic leagues), the exact same top-8 matches got warmed
  // every single cron tick - anything beyond position 8 in the stable sort
  // order NEVER got warmed at all, no matter how many times the cron ran.
  // A persisted rotating offset spreads warming across every candidate
  // over a few cycles instead of only ever covering the same fixed subset.
  const { env: env2 } = await import("cloudflare:workers");
  const db = (env2 as unknown as { DB?: D1Database }).DB;
  let rotationOffset = 0;
  if (db && candidates.length) {
    await db.prepare(`CREATE TABLE IF NOT EXISTS api_cache (cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL DEFAULT '[]',saved_at INTEGER NOT NULL DEFAULT 0,retry_after INTEGER NOT NULL DEFAULT 0)`).run();
    const row = await db.prepare("SELECT payload FROM api_cache WHERE cache_key='warm_rotation_offset'").first<{ payload: string }>();
    rotationOffset = row ? (Number.parseInt(row.payload, 10) || 0) : 0;
    const nextOffset = (rotationOffset + MAX_PER_RUN) % candidates.length;
    await db.prepare(`INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES('warm_rotation_offset',?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=0`)
      .bind(String(nextOffset), Date.now()).run();
  }
  const rotated = candidates.length
    ? Array.from({ length: Math.min(MAX_PER_RUN, candidates.length) }, (_, i) => candidates[(rotationOffset + i) % candidates.length])
    : [];

  for (const candidate of rotated) {
    await getLiveMatchDetailsV2(candidate.id);
    warmed.push(candidate.id);
  }

  return Response.json({ ok: true, results, candidateCount: candidates.length, warmedCount: warmed.length, rotationOffset });
}
