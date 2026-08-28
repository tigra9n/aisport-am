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

// Same club/player getting picked again soon after was letting a single
// hot story (e.g. an ongoing transfer saga) get covered twice within a
// couple hours - two different outlets (caughtoffside.com, sportbible.com)
// each independently reporting on Arsenal's Martinelli/Paixao situation,
// both passing URL-based dedup since the URLs genuinely differ even
// though the underlying story is the same. articleExistsForSource only
// catches exact-URL repeats, not "same topic, different outlet".
//
// IMPORTANT: this must not block a genuinely different, important story
// about the same entity (e.g. Arsenal signs someone unrelated, or a
// manager is sacked, shortly after an unrelated Arsenal story). So this
// isn't a blanket per-entity cooldown - it compares the new candidate's
// title against the last title used for that entity and only treats it
// as a repeat if they share enough distinctive words to plausibly be the
// same underlying story. A different headline about the same entity
// passes straight through regardless of timing.
const ENTITY_COOLDOWN_MS = 5 * 60 * 60 * 1000; // 5 hours
const STOPWORDS = new Set(["the","a","an","and","or","but","in","on","at","to","for","of","with","is","are","was","were","be","been","as","by","from","it","its","his","her","their","after","before","new","says","said","set","out","up","who","how","why","what","this","that","will","has","have","not","no"]);

function significantWords(title: string): Set<string> {
  return new Set(
    title.toLowerCase().replace(/['’]/g, "").split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
  );
}

function sharesTopicWith(a: string, b: string): boolean {
  const wa = significantWords(a);
  const wb = significantWords(b);
  if (!wa.size || !wb.size) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  // 2+ shared distinctive words (player/club/subject names) is a strong
  // signal of the same underlying story, not just the same entity.
  return shared >= 2;
}

async function isTopicRecentlyCovered(value: string, candidateTitle: string): Promise<boolean> {
  try {
    const { env } = await import("cloudflare:workers");
    const db = (env as unknown as { DB?: D1Database }).DB;
    if (!db) return false;
    const row = await db.prepare("SELECT payload, saved_at AS savedAt FROM api_cache WHERE cache_key=?")
      .bind(`entity_cooldown:${value}`).first<{ payload: string; savedAt: number }>();
    if (!row) return false;
    if (Date.now() - row.savedAt > ENTITY_COOLDOWN_MS) return false;
    return sharesTopicWith(row.payload, candidateTitle);
  } catch {
    return false;
  }
}

async function markEntityUsed(value: string, title: string): Promise<void> {
  try {
    const { env } = await import("cloudflare:workers");
    const db = (env as unknown as { DB?: D1Database }).DB;
    if (!db) return;
    await db.prepare(`CREATE TABLE IF NOT EXISTS api_cache (cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL DEFAULT '[]',saved_at INTEGER NOT NULL DEFAULT 0,retry_after INTEGER NOT NULL DEFAULT 0)`).run();
    await db.prepare(`INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=0`)
      .bind(`entity_cooldown:${value}`, title, Date.now()).run();
  } catch {
    // Non-fatal: worst case, topic tracking just doesn't apply this one time.
  }
}

// Separate from the per-entity topic-similarity check above: one club
// having an unusually active real news day (multiple genuinely distinct
// transfer angles - e.g. Arsenal's Alvarez/Martinelli/Endrick saga each
// worded differently enough to pass the 2-shared-word topic check) could
// still end up dominating the feed, since each individual story looked
// "new" in isolation. This tracks a rolling window of which entities got
// generated recently and skips one that's already appeared often, so
// coverage stays spread across clubs/players even during someone's
// unusually busy news cycle.
const BALANCE_WINDOW_MS = 3 * 60 * 60 * 1000; // 3 hours
const BALANCE_MAX_REPEATS = 2; // allow at most 2 articles per entity within the window

async function isEntityOverrepresented(value: string): Promise<boolean> {
  try {
    const { env } = await import("cloudflare:workers");
    const db = (env as unknown as { DB?: D1Database }).DB;
    if (!db) return false;
    const row = await db.prepare("SELECT payload FROM api_cache WHERE cache_key='recent_entities_window'").first<{ payload: string }>();
    if (!row) return false;
    const list = JSON.parse(row.payload) as { value: string; ts: number }[];
    const cutoff = Date.now() - BALANCE_WINDOW_MS;
    const recentCount = list.filter((e) => e.ts >= cutoff && e.value === value).length;
    return recentCount >= BALANCE_MAX_REPEATS;
  } catch {
    return false;
  }
}

async function recordEntityInWindow(value: string): Promise<void> {
  try {
    const { env } = await import("cloudflare:workers");
    const db = (env as unknown as { DB?: D1Database }).DB;
    if (!db) return;
    await db.prepare(`CREATE TABLE IF NOT EXISTS api_cache (cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL DEFAULT '[]',saved_at INTEGER NOT NULL DEFAULT 0,retry_after INTEGER NOT NULL DEFAULT 0)`).run();
    const row = await db.prepare("SELECT payload FROM api_cache WHERE cache_key='recent_entities_window'").first<{ payload: string }>();
    const cutoff = Date.now() - BALANCE_WINDOW_MS;
    const list: { value: string; ts: number }[] = row ? JSON.parse(row.payload) : [];
    const trimmed = list.filter((e) => e.ts >= cutoff);
    trimmed.push({ value, ts: Date.now() });
    await db.prepare(`INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES('recent_entities_window',?,?,0) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at,retry_after=0`)
      .bind(JSON.stringify(trimmed), Date.now()).run();
  } catch {
    // Non-fatal: worst case, balance tracking just doesn't apply this one time.
  }
}

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

async function runRss(apiKey: string, log: string[], deadline: number, sourceFilter?: string | null, debugTitleQuery?: string | null): Promise<number> {
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
          // One-off manual debug override (?titleQuery=...) to test
          // coverage outside the current football-only entity rotation,
          // e.g. verifying a category page works once real content in a
          // not-yet-covered sport (Formula 1) actually exists.
          if (debugTitleQuery) {
            const found = await fetchApiTubeTitle(apiTubeKey, debugTitleQuery, 30);
            log.push(`rss debug: manual titleQuery=${debugTitleQuery} -> ${found.length} items`);
            items = found;
          }
          if (!items.length) {
            const cycle = Math.floor(Date.now() / (60 * 60 * 1000));
            const rotationSeed = Math.floor(Date.now() / (60 * 1000));
            for (const pick of pickCombinedChain(cycle, rotationSeed)) {
              if (Date.now() > deadline) break;
              if (await isEntityOverrepresented(pick.value)) continue;
              const found = pick.filterType === "title"
                ? await fetchApiTubeTitle(apiTubeKey, pick.value, 30)
                : await fetchApiTubePerson(apiTubeKey, pick.value, 30);
              if (!found.length) continue;
              // Bug fixed: previously broke here on the first entity with
              // ANY items, even if every single one turned out to already
              // be published (checked later, per-item, in the loop
              // below). If that entity's items were all duplicates, the
              // whole attempt gave up instead of trying the next entity
              // in the chain - wasted a window's only publish slot on
              // nothing. Now check for at least one genuinely new item
              // before committing to this entity's results. Also skips
              // candidates that look like the same underlying story as
              // the last thing generated for this entity (see
              // isTopicRecentlyCovered) - two different outlets covering
              // one ongoing transfer saga, for example - while still
              // allowing a genuinely different, important story about
              // the same club/player through.
              const newItems: FeedItem[] = [];
              for (const candidate of found) {
                if (await articleExistsForSource(candidate.link)) continue;
                if (await isTopicRecentlyCovered(pick.value, candidate.title)) continue;
                newItems.push(candidate);
              }
              if (newItems.length) {
                log.push(`rss debug: ${pick.filterType}=${pick.value} -> ${found.length} items, ${newItems.length} new`);
                items = newItems;
                await markEntityUsed(pick.value, newItems[0].title);
                await recordEntityInWindow(pick.value);
                break;
              }
              log.push(`rss debug: ${pick.filterType}=${pick.value} -> ${found.length} items, all duplicates/same-topic, trying next`);
            }
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
  // Re-bind as an explicitly-typed const: TypeScript's narrowing from the
  // early-return above doesn't carry into the nested doGeneration()
  // function declaration below otherwise.
  const claudeApiKey: string = apiKey;

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

  // 3 attempts per hour, spread across 20-minute windows (0-19, 20-39,
  // 40-59) instead of 1 attempt per hour. Gate on "already published an
  // article in this UTC hour AND this 20-minute window" rather than a
  // fixed minute range - same reasoning as before: Cloudflare's native
  // cron and the GitHub Actions backup cron both have their own jitter,
  // so whichever tick actually fires first within a window does that
  // window's attempt, landing close to (but not exactly on) :00/:20/:40
  // once the ~1-2min generation time is added.
  if (!forcedMode) {
    try {
      const { getDb } = await import("../../../../db");
      const { articles } = await import("../../../../db/schema");
      const { desc } = await import("drizzle-orm");
      const db = await getDb();
      const recent = await db.select({ publishedAt: articles.publishedAt }).from(articles).orderBy(desc(articles.id)).limit(3);
      const now = new Date();
      const currentWindow = Math.floor(now.getUTCMinutes() / 20);
      const sameHourWindowCount = recent.filter((row) => {
        if (!row.publishedAt) return false;
        const d = new Date(row.publishedAt.replace(" ", "T") + "Z");
        return d.getUTCFullYear() === now.getUTCFullYear()
          && d.getUTCMonth() === now.getUTCMonth()
          && d.getUTCDate() === now.getUTCDate()
          && d.getUTCHours() === now.getUTCHours()
          && Math.floor(d.getUTCMinutes() / 20) === currentWindow;
      }).length;
      if (sameHourWindowCount > 0) {
        return Response.json({ ok: true, mode: "skipped", reason: "already published an article in this 20-minute window", generated: 0, log: [] });
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
  if (mode === "recap") generated = await runRecaps(claudeApiKey, log, deadline);
  else if (mode === "preview") generated = await runPreviews(claudeApiKey, log, deadline);
  else generated = await runRss(claudeApiKey, log, deadline, url.searchParams.get("source"), url.searchParams.get("titleQuery"));

  return Response.json({ ok: true, mode, generated, log });
}
