import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { sources } from "../../../../db/schema";
import { articleExistsForSource, saveGeneratedArticle } from "../../../../lib/articles";
import { generateFromSourceSnippet, generateMatchPreview, generateMatchRecap } from "../../../../lib/content-generation";
import { fetchFeed } from "../../../../lib/feeds";
import { getLiveMatches } from "../../../../lib/live-football-server";
import { getLiveMatchDetailsV2 } from "../../../../lib/live-match-details-v2";

export const dynamic = "force-dynamic";

// Each category gets its own slot per run so match recaps/previews can never
// crowd out real RSS news (previously all three shared one pool of 3, and
// recaps+previews alone regularly used it all up, so RSS news never ran).
const MAX_RECAPS_PER_RUN = 1;
const MAX_PREVIEWS_PER_RUN = 1;
const MAX_RSS_PER_RUN = 1;

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

  let generated = 0;
  let recapsGenerated = 0;
  let previewsGenerated = 0;
  let rssGenerated = 0;
  const log: string[] = [];

  // 1) Rewrites from enabled RSS sources — runs FIRST. Cloudflare Workers
  // caps subrequests per invocation; recap/preview generation below makes
  // many API-Football subrequests (events, lineups, stats, h2h, prediction,
  // injuries, standings, top scorers per match) and was regularly exhausting
  // that budget before the RSS fetch ever ran, so real news silently never
  // got fetched. Running RSS first guarantees it always gets its subrequests.
  {
    try {
      const db = await getDb();
      const enabledSources = await db.select().from(sources).where(eq(sources.enabled, true)).orderBy(desc(sources.id));
      log.push(`[debug] enabledSources count: ${enabledSources.length}`);
      for (const source of enabledSources) {
        if (rssGenerated >= MAX_RSS_PER_RUN) break;
        const items = await fetchFeed(source.feedUrl, 8);
        log.push(`[debug] ${source.name}: fetched ${items.length} items`);
        for (const item of items) {
          if (rssGenerated >= MAX_RSS_PER_RUN) break;
          const exists = await articleExistsForSource(item.link);
          if (exists) { log.push(`[debug] skip (exists): ${item.title.slice(0, 40)}`); continue; }
          const article = await generateFromSourceSnippet(apiKey, { title: item.title, snippet: item.snippet, sourceName: source.name });
          if (!article) { log.push(`[debug] generation failed for: ${item.title.slice(0, 40)}`); continue; }
          const saved = await saveGeneratedArticle({
            ...article,
            imageUrl: item.imageUrl,
            sourceName: source.name,
            sourceUrl: item.link,
            uniquePart: String(Date.now()).slice(-8),
          });
          if (saved) { generated++; rssGenerated++; log.push(`rewrite: ${item.title.slice(0, 40)}`); }
          else { log.push(`[debug] save failed (duplicate?) for: ${item.title.slice(0, 40)}`); }
        }
      }
    } catch (err) {
      log.push(`rss error: ${String(err)}`);
    }
  }

  // 2) Recaps for recently-finished matches.
  try {
    const { matches } = await getLiveMatches(0, true);
    const finished = matches.filter((m) => !m.isLive && m.homeScore !== null && m.status === "Ավարտված");
    for (const match of finished) {
      if (recapsGenerated >= MAX_RECAPS_PER_RUN) break;
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
        ...article,
        imageUrl: match.homeLogo,
        sourceName: "AISport",
        sourceUrl,
        uniquePart: match.id,
      });
      if (saved) { generated++; recapsGenerated++; log.push(`recap: ${match.home} vs ${match.away}`); }
    }
  } catch (err) {
    log.push(`recap error: ${String(err)}`);
  }

  // 3) Previews for today's not-yet-started matches.
  {
    try {
      const { matches } = await getLiveMatches(0, true);
      const upcoming = matches.filter((m) => !m.isLive && m.homeScore === null);
      for (const match of upcoming) {
        if (previewsGenerated >= MAX_PREVIEWS_PER_RUN) break;
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
          ...article,
          imageUrl: match.homeLogo,
          sourceName: "AISport",
          sourceUrl,
          uniquePart: `${match.id}-preview`,
        });
        if (saved) { generated++; previewsGenerated++; log.push(`preview: ${match.home} vs ${match.away}`); }
      }
    } catch (err) {
      log.push(`preview error: ${String(err)}`);
    }
  }

  return Response.json({ ok: true, generated, log });
}
