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
      }, details.events);
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
        const article = await generateMatchPreview(apiKey, {
          home: match.home, away: match.away, competition: match.competition, kickoff: match.status,
        }, {});
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
