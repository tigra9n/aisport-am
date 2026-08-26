import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { sources } from "../../../../db/schema";
import { articleExistsForSource, saveGeneratedArticle } from "../../../../lib/articles";
import { generateFromSourceSnippet, generateMatchPreview, generateMatchRecap, lastGenerationDebug } from "../../../../lib/content-generation";
import { fetchArticlePage, fetchFeed, fetchApiTubePerson, fetchApiTubeTitle, validateImageUrl, type FeedItem } from "../../../../lib/feeds";
import { pickCombinedChain } from "../../../../lib/football-entities";
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
const MAX_PER_TYPE = 1;

// Hard wall-clock budget for a single invocation. Real Claude Sonnet 5
// generation for a full article (max_tokens ~2048) genuinely takes
// 30-40+ seconds - this isn't a bug, just how long it takes. Budget must
// comfortably fit one full attempt, not try to rush it.
const TIME_BUDGET_MS = 115_000;

async function runRecaps(apiKey: string, log: string[], deadline: number): Promise<number> {
  let generated = 0;
  let attempted = 0;
  const MAX_ATTEMPTS = 1;
  try {
    // Right after midnight (Yerevan time), "today" (dayOffset=0) has
    // already rolled over to the new calendar day, whose matches mostly
    // haven't kicked off yet - a match that finished just before midnight
    // now falls under "yesterday" and gets missed entirely. Check both.
    const [todayResult, yesterdayResult] = await Promise.all([
      getLiveMatches(0, true),
      getLiveMatches(-1, true),
    ]);
    const matches = [...todayResult.matches, ...yesterdayResult.matches];
    const finished = matches.filter((m) => !m.isLive && m.homeScore !== null && m.status === "Ավարտված");
    log.push(`recap debug: total=${matches.length}, finished=${finished.length} (${finished.map((m) => `${m.home}-${m.away}/${m.competition}`).join(", ")})`);
    for (const match of finished) {
      if (generated >= MAX_PER_TYPE || attempted >= MAX_ATTEMPTS) break;
      if (Date.now() > deadline) { log.push("recap: time budget exceeded, stopping early"); break; }
      const sourceUrl = `https://aisport.am/live/match/${match.id}`;
      if (await articleExistsForSource(sourceUrl)) continue;
      const details = await getLiveMatchDetailsV2(match.id);
      if (!details) continue;
      attempted++;
      const article = await generateMatchRecap(apiKey, {
        home: match.home, away: match.away, homeScore: match.homeScore, awayScore: match.awayScore,
        competition: match.competition, venue: details.venue,
      }, details.events, details.statistics);
      if (!article) continue;
      const saved = await saveGeneratedArticle({
        ...article, imageUrl: null, sourceName: "AISport", sourceUrl, uniquePart: match.id,
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
  let attempted = 0;
  const MAX_ATTEMPTS = 1;
  try {
    const { matches } = await getLiveMatches(0, true);
    const upcoming = matches.filter((m) => !m.isLive && m.homeScore === null);
    for (const match of upcoming) {
      if (generated >= MAX_PER_TYPE || attempted >= MAX_ATTEMPTS) break;
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
      attempted++;
      if (!article) continue;
      const saved = await saveGeneratedArticle({
        ...article, imageUrl: null, sourceName: "AISport", sourceUrl, uniquePart: `${match.id}-preview`,
      });
      if (saved) { generated++; log.push(`preview: ${match.home} vs ${match.away}`); }
    }
  } catch (err) {
    log.push(`preview error: ${String(err)}`);
  }
  return generated;
}

async function runRss(apiKey: string, log: string[], deadline: number, sourceFilter?: string | null): Promise<number> {
  let generated = 0;
  let attempted = 0;
  // Cap total generation attempts, not just successes. Each attempt can
  // take up to the per-call timeout regardless of whether it succeeds, so
  // without this a string of parse failures could each eat a long time and
  // blow way past the route's own time budget before the deadline check
  // between items ever gets a chance to catch it.
  //
  // Reverted 2 -> 1 for cost minimization: now only 1 rss attempt/hour
  // total (not per 5-min tick), so a single try per hour keeps cost as
  // low and predictable as possible per explicit request.
  const MAX_ATTEMPTS = 1;
  try {
    const db = await getDb();
    const allSources = await db.select().from(sources).where(eq(sources.enabled, true)).orderBy(desc(sources.id));
    // Rotate which source goes first each tick instead of always trying
    // the same (highest-id) source first. Without this, whichever source
    // has fresh un-generated items keeps winning every single tick, so
    // e.g. one basketball-heavy source can dominate for a long stretch
    // while football-only sources never get a turn.
    const tickIndex = Math.floor(Date.now() / (5 * 60 * 1000));
    const offset = allSources.length > 0 ? tickIndex % allSources.length : 0;
    const rotated = [...allSources.slice(offset), ...allSources.slice(0, offset)];
    const enabledSources = sourceFilter
      ? rotated.filter((s) => s.name.toLowerCase().includes(sourceFilter.toLowerCase()))
      : rotated;
    log.push(`rss debug: allSources=${allSources.length}, filter=${sourceFilter ?? "none"}, matched=${enabledSources.length} (${enabledSources.map((s) => s.name).join(", ")})`);
    for (const source of enabledSources) {
      if (generated >= MAX_PER_TYPE || attempted >= MAX_ATTEMPTS) break;
      if (Date.now() > deadline) { log.push("rss: time budget exceeded, stopping early"); break; }
      // Consider more candidates per tick now that per_page is 50 (up
      // from 10), so a tick where the newest few items are already
      // published still has plenty of untried items to fall through to.
      //
      // Football-focused named-entity query for the APITube source:
      // instead of the broad category.id="Sport" feed, filter by a
      // rotating (organization.name/person.name/event.name) chunk from
      // lib/football-entities.ts. One-hour cycles so the priority-100
      // (Armenia) entities get queried every cycle, 90 every 2nd, 80
      // every 4th, 70 every 8th, per the provided config.
      // Football-focused named-entity query for the APITube source:
      // filters by a rotating club (title= free-text search) or
      // player/coach (person.name entity filter) from
      // lib/football-entities.ts instead of the broad category.id="Sport"
      // feed. Alternates which type leads each cycle so both get regular
      // turns. Tries one value at a time (not comma-lists - a single
      // unrecognized person.name fails the whole request) until one
      // actually returns articles, falling back to the old category feed
      // as a last resort if the whole chain comes up empty.
      let items: FeedItem[] = [];
      if (source.feedUrl.includes("/api/feeds/apitube")) {
        const apiTubeKey = new URL(source.feedUrl).searchParams.get("api_key");
        if (apiTubeKey) {
          const cycle = Math.floor(Date.now() / (60 * 60 * 1000));
          const rotationSeed = Math.floor(Date.now() / (60 * 1000));
          for (const pick of pickCombinedChain(cycle, rotationSeed)) {
            const found = pick.filterType === "title"
              ? await fetchApiTubeTitle(apiTubeKey, pick.value, 30)
              : await fetchApiTubePerson(apiTubeKey, pick.value, 30);
            if (found.length) {
              log.push(`rss debug: ${pick.filterType}=${pick.value} -> ${found.length} items`);
              items = found;
              break;
            }
            if (Date.now() > deadline) break;
          }
        }
      }
      if (!items.length) items = await fetchFeed(source.feedUrl, 30);
      log.push(`rss debug: source=${source.name}, items=${items.length}`);
      for (const item of items) {
        if (generated >= MAX_PER_TYPE || attempted >= MAX_ATTEMPTS) break;
        if (Date.now() > deadline) { log.push("rss: time budget exceeded, stopping early"); break; }
        if (await articleExistsForSource(item.link)) continue;
        attempted++;
        // Fetch the actual source article page before generating: the RSS
        // snippet alone (title + ~1-2 sentences) left the model with
        // almost no real facts (names, scores) to work from, producing
        // vague generic-sounding articles. Full body text + og:image in
        // one request.
        const page = await fetchArticlePage(item.link);
        const article = await generateFromSourceSnippet(apiKey, { title: item.title, snippet: item.snippet, sourceName: source.name, fullText: page.bodyText });
        if (!article) { log.push(`rss generation failed: ${item.title.slice(0, 40)} | ${lastGenerationDebug}`); continue; }
        // item.imageUrl (from APITube/RSS directly) can itself be a dead
        // link on the source's end (found: cappertek.com's own listed
        // image 404'd) - validate before trusting it, same as page.image.
        const resolvedImage = (await validateImageUrl(item.imageUrl)) ?? page.image;
        const saved = await saveGeneratedArticle({
          ...article, imageUrl: resolvedImage, sourceName: source.name, sourceUrl: item.link, uniquePart: String(Date.now()).slice(-8),
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
  const token = url.searchParams.get("token");
  // Accept either CRON_TOKEN (Cloudflare native + GitHub Actions backup)
  // or CRONJOB_TOKEN (third independent trigger via cron-job.org) - two
  // separate tokens so an external service never needs the same secret
  // used internally.
  const validToken = (token && token === runtime.CRON_TOKEN) || (token && token === runtime.CRONJOB_TOKEN);
  if (!validToken) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const apiKey = runtime.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ ok: false, reason: "no ANTHROPIC_API_KEY configured yet" });
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

  // Cost-saving mode per request: only APITube (rss), roughly once per
  // hour, one attempt. Previously gated on "minute 0-4 of the hour", but
  // that was too fragile in practice: Cloudflare's native cron trigger
  // has a known intermittent bug where it stops firing for extended
  // periods, and the GitHub Actions backup cron has its own scheduling
  // jitter (doesn't reliably land in a narrow 5-minute window). Combined,
  // real attempts were sometimes being skipped for over an hour even
  // though *some* tick (native or backup) did fire during that time.
  //
  // Gate on "has an article already been published this UTC hour" instead
  // of a fixed minute range - any tick, whenever it actually fires, can
  // be the one that does this hour's attempt. If an attempt fails to find
  // anything, later ticks that same hour will keep trying rather than
  // giving up until next hour.
  if (!forcedMode) {
    try {
      const { getDb } = await import("../../../../db");
      const { articles } = await import("../../../../db/schema");
      const { desc } = await import("drizzle-orm");
      const db = await getDb();
      const [latest] = await db.select({ publishedAt: articles.publishedAt }).from(articles).orderBy(desc(articles.id)).limit(1);
      if (latest?.publishedAt) {
        const latestDate = new Date(latest.publishedAt.replace(" ", "T") + "Z");
        const now = new Date();
        const sameHour = latestDate.getUTCFullYear() === now.getUTCFullYear()
          && latestDate.getUTCMonth() === now.getUTCMonth()
          && latestDate.getUTCDate() === now.getUTCDate()
          && latestDate.getUTCHours() === now.getUTCHours();
        if (sameHour) {
          return Response.json({ ok: true, mode: "skipped", reason: "already published an article this hour", generated: 0, log: [] });
        }
      }
    } catch {
      // If the check itself fails for some reason, fall through and
      // attempt generation anyway rather than silently skipping forever.
    }
  }
  const mode = forcedMode ?? "rss";

  const deadline = Date.now() + TIME_BUDGET_MS;
  const log: string[] = [];
  let generated = 0;
  if (mode === "recap") generated = await runRecaps(apiKey, log, deadline);
  else if (mode === "preview") generated = await runPreviews(apiKey, log, deadline);
  else generated = await runRss(apiKey, log, deadline, url.searchParams.get("source"));

  return Response.json({ ok: true, mode, generated, log });
}
