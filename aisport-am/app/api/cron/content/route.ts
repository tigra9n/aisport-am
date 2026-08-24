import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { sources } from "../../../../db/schema";
import { articleExistsForSource, saveGeneratedArticle } from "../../../../lib/articles";
import { generateFromSourceSnippet, generateMatchPreview, generateMatchRecap, lastGenerationDebug } from "../../../../lib/content-generation";
import { fetchFeed } from "../../../../lib/feeds";
import { getLiveMatches } from "../../../../lib/live-football-server";
import { getLiveMatchDetailsV2 } from "../../../../lib/live-match-details-v2";

export const dynamic = "force-dynamic";

// Cloudflare Workers cap the number of subrequests (fetch calls + D1
// queries) a single invocation can make. getLiveMatchDetailsV2 alone can
// use 8-10 subrequests per match (fixture, events, lineups, stats, h2h,
// standings, topscorers, ratings). Doing recap+preview+RSS all in one
// invocation for multiple matches blew past that limit, which silently
// starved the RSS step of any remaining budget. Fix: rotate through one
// content type per cron tick instead of doing all three every time.
const MAX_PER_TYPE = 2;

// Hard wall-clock budget for a single invocation. Without this, a loop that
// keeps hitting failing/slow Claude API calls (one per RSS item, each with
// its own timeout) can run for many minutes with nothing ever generated or
// logged, which is indistinguishable from the cron simply not firing.
// Cutting the loop off here guarantees the endpoint always returns quickly.
const TIME_BUDGET_MS = 20_000;

async function runRecaps(apiKey: string, log: string[], deadline: number): Promise<number> {
  let generated = 0;
  try {
    const { matches } = await getLiveMatches(0, true);
    const finished = matches.filter((m) => !m.isLive && m.homeScore !== null && m.status === "Ավարտված");
    for (const match of finished) {
      if (generated >= MAX_PER_TYPE) break;
      if (Date.now() > deadline) { log.push("recap: time budget exceeded, stopping early"); break; }
      const sourceUrl = `https://aisport.am/live/match/${match.id}`;
      if (await articleExistsForSource(sourceUrl)) continue;
      const details = await getLiveMatchDetailsV2(match.id);
      if (!details) continue;
      const article = await generateMatchRecap(apiKey, {
        home: match.home, away: match.away, homeScore: match.homeScore, awayScore: match.awayScore,
        competition: match.competition, venue: details.venue,
      }, details.events, details.statistics);
      if (!article) continue;
      const saved = await saveGeneratedArticle({
        ...article, imageUrl: match.homeLogo, sourceName: "AISport", sourceUrl, uniquePart: match.id,
      });
      if (saved) { generated++; log.push(`recap: ${match.home} vs ${match.away}`); }
    }
  } catch (err) {
    log.push(`recap error: ${String(err)}`);
  }
  return generated;
}

async function runPreviews(apiKey: string, log: string[], deadline: number): Promise<number> {
  let generated = 0;
  try {
    const { matches } = await getLiveMatches(0, true);
    const upcoming = matches.filter((m) => !m.isLive && m.homeScore === null);
    for (const match of upcoming) {
      if (generated >= MAX_PER_TYPE) break;
      if (Date.now() > deadline) { log.push("preview: time budget exceeded, stopping early"); break; }
      const sourceUrl = `https://aisport.am/live/match/${match.id}#preview`;
      if (await articleExistsForSource(sourceUrl)) continue;
      const details = await getLiveMatchDetailsV2(match.id);
      const context: { h2h?: string; homeForm?: string; awayForm?: string; standings?: string; prediction?: string } = {};
      if (details) {
        if (details.h2h.length > 0) {
          const homeWins = details.h2h.filter((g) => (g.home === match.home && (g.homeScore ?? 0) > (g.awayScore ?? 0)) || (g.away === match.home && (g.awayScore ?? 0) > (g.homeScore ?? 0))).length;
          const awayWins = details.h2h.filter((g) => (g.home === match.away && (g.homeScore ?? 0) > (g.awayScore ?? 0)) || (g.away === match.away && (g.awayScore ?? 0) > (g.homeScore ?? 0))).length;
          const draws = details.h2h.length - homeWins - awayWins;
          const lastMeeting = details.h2h[0];
          context.h2h = `Վերջին ${details.h2h.length} հանդիպումներից՝ ${match.home} ${homeWins} հաղթանակ, ${match.away} ${awayWins} հաղթանակ, ${draws} ոչ-ոքի։ Վերջին խաղը (${lastMeeting.date})՝ ${lastMeeting.home} ${lastMeeting.homeScore} - ${lastMeeting.awayScore} ${lastMeeting.away}։`;
        }
        const homeFormRow = details.formGuide.find((f) => f.team === match.home);
        const awayFormRow = details.formGuide.find((f) => f.team === match.away);
        if (homeFormRow) context.homeForm = `${homeFormRow.won}Հ-${homeFormRow.draw}Ո-${homeFormRow.lost}Պ, միջին ${homeFormRow.goalsForAvg} գոլ խաղում (վերջին ձևը՝ ${homeFormRow.form || "անհայտ"})`;
        if (awayFormRow) context.awayForm = `${awayFormRow.won}Հ-${awayFormRow.draw}Ո-${awayFormRow.lost}Պ, միջին ${awayFormRow.goalsForAvg} գոլ խաղում (վերջին ձևը՝ ${awayFormRow.form || "անհայտ"})`;
        if (details.standings) {
          const homeRow = details.standings.find((r) => r.team === match.home);
          const awayRow = details.standings.find((r) => r.team === match.away);
          if (homeRow || awayRow) {
            context.standings = [
              homeRow ? `${match.home}՝ ${homeRow.position}-րդ տեղ, ${homeRow.points} միավոր` : null,
              awayRow ? `${match.away}՝ ${awayRow.position}-րդ տեղ, ${awayRow.points} միավոր` : null,
            ].filter(Boolean).join("; ");
          }
        }
        if (details.prediction) {
          context.prediction = `Հաղթանակի հավանականություններ՝ ${match.home} ${details.prediction.homePct}, ոչ-ոքի ${details.prediction.drawPct}, ${match.away} ${details.prediction.awayPct}։${details.prediction.advice ? ` Վերլուծություն՝ ${details.prediction.advice}` : ""}`;
        }
      }
      const article = await generateMatchPreview(apiKey, {
        home: match.home, away: match.away, competition: match.competition, kickoff: match.status,
      }, context);
      if (!article) continue;
      const saved = await saveGeneratedArticle({
        ...article, imageUrl: match.homeLogo, sourceName: "AISport", sourceUrl, uniquePart: `${match.id}-preview`,
      });
      if (saved) { generated++; log.push(`preview: ${match.home} vs ${match.away}`); }
    }
  } catch (err) {
    log.push(`preview error: ${String(err)}`);
  }
  return generated;
}

async function runRss(apiKey: string, log: string[], deadline: number): Promise<number> {
  let generated = 0;
  try {
    const db = await getDb();
    const enabledSources = await db.select().from(sources).where(eq(sources.enabled, true)).orderBy(desc(sources.id));
    for (const source of enabledSources) {
      if (generated >= MAX_PER_TYPE) break;
      if (Date.now() > deadline) { log.push("rss: time budget exceeded, stopping early"); break; }
      const items = await fetchFeed(source.feedUrl, 6);
      for (const item of items) {
        if (generated >= MAX_PER_TYPE) break;
        if (Date.now() > deadline) { log.push("rss: time budget exceeded, stopping early"); break; }
        if (await articleExistsForSource(item.link)) continue;
        const article = await generateFromSourceSnippet(apiKey, { title: item.title, snippet: item.snippet, sourceName: source.name });
        if (!article) { log.push(`rss generation failed: ${item.title.slice(0, 40)} | ${lastGenerationDebug}`); continue; }
        const saved = await saveGeneratedArticle({
          ...article, imageUrl: item.imageUrl, sourceName: source.name, sourceUrl: item.link, uniquePart: String(Date.now()).slice(-8),
        });
        if (saved) { generated++; log.push(`rewrite: ${item.title.slice(0, 40)}`); }
      }
    }
  } catch (err) {
    log.push(`rss error: ${String(err)}`);
  }
  return generated;
}

export async function GET(request: Request) {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;
  const url = new URL(request.url);
  if (url.searchParams.get("token") !== runtime.CRON_TOKEN || !runtime.CRON_TOKEN) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const apiKey = runtime.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ ok: false, reason: "no ANTHROPIC_API_KEY configured yet" });
  }

  // Diagnostic: isolate whether the Worker can reach api.anthropic.com at
  // all (lightweight GET, no request body) vs. only the actual generation
  // call (POST /v1/messages) hanging.
  if (url.searchParams.get("mode") === "ping") {
    const started = Date.now();
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch("https://api.anthropic.com/v1/models", {
        signal: controller.signal,
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      });
      clearTimeout(t);
      const bodyText = await res.text().catch(() => "");
      return Response.json({ ok: true, mode: "ping", status: res.status, ms: Date.now() - started, body: bodyText.slice(0, 200) });
    } catch (err) {
      return Response.json({ ok: false, mode: "ping", ms: Date.now() - started, error: String(err) });
    }
  }

  // Diagnostic: minimal POST /v1/messages call (tiny prompt, no system
  // prompt) to isolate whether it's the endpoint/model itself hanging, or
  // something about our larger request body.
  if (url.searchParams.get("mode") === "ping2") {
    const started = Date.now();
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 15_000);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 10, messages: [{ role: "user", content: "hi" }] }),
      });
      clearTimeout(t);
      const bodyText = await res.text().catch(() => "");
      return Response.json({ ok: true, mode: "ping2", status: res.status, ms: Date.now() - started, body: bodyText.slice(0, 300) });
    } catch (err) {
      return Response.json({ ok: false, mode: "ping2", ms: Date.now() - started, error: String(err) });
    }
  }

  const forcedMode = url.searchParams.get("mode");

  // Publishing window: 10:00–02:00 Yerevan time (UTC+4, no DST). Manual
  // ?mode= calls bypass the window so testing works any time of day.
  if (!forcedMode) {
    const yerevanHour = (new Date().getUTCHours() + 4) % 24;
    const inWindow = yerevanHour >= 10 || yerevanHour < 2;
    if (!inWindow) {
      return Response.json({ ok: true, mode: "skipped", reason: "outside 10:00-02:00 Yerevan publishing window", generated: 0, log: [] });
    }
  }

  // Each tick is 5 minutes apart; rotate content type per tick.
  const tickSlot = Math.floor(Date.now() / (5 * 60 * 1000)) % 3;
  const mode = forcedMode ?? (tickSlot === 0 ? "recap" : tickSlot === 1 ? "preview" : "rss");

  const deadline = Date.now() + TIME_BUDGET_MS;
  const log: string[] = [];
  let generated = 0;
  if (mode === "recap") generated = await runRecaps(apiKey, log, deadline);
  else if (mode === "preview") generated = await runPreviews(apiKey, log, deadline);
  else generated = await runRss(apiKey, log, deadline);

  return Response.json({ ok: true, mode, generated, log });
}
