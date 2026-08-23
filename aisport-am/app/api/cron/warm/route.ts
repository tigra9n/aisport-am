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

  for (const offset of [-1, 0]) {
    const { matches } = await getLiveMatches(offset, true);
    results.push({ date: String(offset), matches: matches.length });
    for (const match of matches) {
      // Skip matches that haven't started yet (no score, not live) — nothing to warm.
      if (!match.isLive && match.homeScore === null && match.awayScore === null) continue;
      await getLiveMatchDetailsV2(match.id);
      warmed.push(match.id);
    }
  }

  return Response.json({ ok: true, results, warmedCount: warmed.length });
}
