import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { sources } from "../../../../db/schema";
import { articleExistsForSource, saveGeneratedArticle } from "../../../../lib/articles";
import { generateFromSourceSnippet, generateMatchPreview, generateMatchRecap } from "../../../../lib/content-generation";
import { fetchFeed } from "../../../../lib/feeds";
import { getLiveMatches } from "../../../../lib/live-football-server";
import { getLiveMatchDetailsV2 } from "../../../../lib/live-match-details-v2";

export const dynamic = "force-dynamic";

const MAX_ARTICLES_PER_RUN = 3;

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
  const log: string[] = [];

  // 1) Recaps for recently-finished matches.
  try {
    const { matches } = await getLiveMatches(0, true);
    const finished = matches.filter((m) => !m.isLive && m.homeScore !== null && m.status === "Ավարտված");
    for (const match of finished) {
      if (generated >= MAX_ARTICLES_PER_RUN) break;
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
      if (saved) { generated++; log.push(`recap: ${match.home} vs ${match.away}`); }
    }
  } catch (err) {
    log.push(`recap error: ${String(err)}`);
  }

  // 2) Previews for today's not-yet-started matches.
  if (generated < MAX_ARTICLES_PER_RUN) {
    try {
      const { matches } = await getLiveMatches(0, true);
      const upcoming = matches.filter((m) => !m.isLive && m.homeScore === null);
      for (const match of upcoming) {
        if (generated >= MAX_ARTICLES_PER_RUN) break;
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
        if (saved) { generated++; log.push(`preview: ${match.home} vs ${match.away}`); }
      }
    } catch (err) {
      log.push(`preview error: ${String(err)}`);
    }
  }

  // 3) Rewrites from enabled RSS sources.
  if (generated < MAX_ARTICLES_PER_RUN) {
    try {
      const db = await getDb();
      const enabledSources = await db.select().from(sources).where(eq(sources.enabled, true)).orderBy(desc(sources.id));
      for (const source of enabledSources) {
        if (generated >= MAX_ARTICLES_PER_RUN) break;
        const items = await fetchFeed(source.feedUrl, 8);
        for (const item of items) {
          if (generated >= MAX_ARTICLES_PER_RUN) break;
          if (await articleExistsForSource(item.link)) continue;
          const article = await generateFromSourceSnippet(apiKey, { title: item.title, snippet: item.snippet, sourceName: source.name });
          if (!article) continue;
          const saved = await saveGeneratedArticle({
            ...article,
            imageUrl: item.imageUrl,
            sourceName: source.name,
            sourceUrl: item.link,
            uniquePart: String(Date.now()).slice(-8),
          });
          if (saved) { generated++; log.push(`rewrite: ${item.title.slice(0, 40)}`); }
        }
      }
    } catch (err) {
      log.push(`rss error: ${String(err)}`);
    }
  }

  return Response.json({ ok: true, generated, log });
}
