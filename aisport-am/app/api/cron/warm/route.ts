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

  for (const candidate of candidates.slice(0, MAX_PER_RUN)) {
    await getLiveMatchDetailsV2(candidate.id);
    warmed.push(candidate.id);
  }

  return Response.json({ ok: true, results, candidateCount: candidates.length, warmedCount: warmed.length });
}
