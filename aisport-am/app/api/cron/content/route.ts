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
const TIME_BUDGET_MS = 210_000; // 95s search budget + 115s generation reserve (100s Claude timeout + margin). Client timeout must be bumped accordingly (see backup-cron.yml).

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
const ENTITY_COOLDOWN_MS = 1 * 60 * 60 * 1000; // 1 hour (was 5h) - with ~99 tracked entities and 20 tried per 20-min attempt, a 5h cooldown could exhaust most of the pool within a few hours, leaving few "fresh" entities available later. 1h recycles much faster while still preventing rapid repetitive coverage of the same entity.
const STOPWORDS = new Set(["the","a","an","and","or","but","in","on","at","to","for","of","with","is","are","was","were","be","been","as","by","from","it","its","his","her","their","after","before","new","says","said","set","out","up","who","how","why","what","this","that","will","has","have","not","no"]);

function significantWords(title: string): Set<string> {
  return new Set(
    title.toLowerCase().replace(/['’]/g, "").split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
  );
}

function sharesTopicWith(a: string, b: string, excludeWords?: Set<string>): boolean {
  const wa = significantWords(a);
  const wb = significantWords(b);
  if (excludeWords) {
    for (const w of excludeWords) { wa.delete(w); wb.delete(w); }
  }
  if (!wa.size || !wb.size) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  // 2+ shared distinctive words (player/club/subject names) is a strong
  // signal of the same underlying story, not just the same entity.
  // Relaxed from 2 to 3 shared words per explicit request - 2 was
  // sometimes flagging genuinely different stories about the same
  // entity as duplicates (even after excluding the entity's own name
  // words), being overly conservative about what counts as "the same
  // story" and suppressing publishable content.
  return shared >= 3;
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
    // BUG FIXED: for multi-word entities (Real Madrid, Manchester United,
    // Bayern Munich, etc.) the entity's own name alone could satisfy the
    // 2-shared-word threshold, since both the old and new title
    // necessarily mention the club by name - this caused completely
    // unrelated stories about the same club (e.g. "signs new manager" vs
    // "wins match") to be incorrectly flagged as duplicates, hurting our
    // most common (2-word) top clubs hardest. Exclude the searched
    // entity's own name words from the comparison - only genuinely
    // distinguishing words (players mentioned, opponent, news type)
    // should count toward "same story".
    const entityWords = significantWords(value);
    return sharesTopicWith(row.payload, candidateTitle, entityWords);
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
    // Armenia is excluded from AI-driven content generation (same policy
    // as the RSS entity-search path in football-entities.ts) - Tigran
    // writes Armenian football/sports content himself via Opinions.
    // getLiveMatches still tracks Armenia for live scores/standings, so
    // this filter is needed here specifically to keep it out of
    // automated recap generation.
    const finished = matches.filter((m) => !m.isLive && m.homeScore !== null && m.status === "Ավարտված" && m.competition !== "Հայաստանի Պրեմիեր լիգա");
    // Prefer the most important available match, not just whichever
    // happens to come first in getLiveMatches' array order (which isn't
    // ordered by significance) - top-5 European leagues and the
    // Champions League rank highest, MLS/Saudi Pro League lowest.
    const COMPETITION_PRIORITY: Record<string, number> = {
      "Չեմպիոնների լիգա": 100,
      "Անգլիայի Պրեմիեր լիգա": 90,
      "Իսպանիայի Լա Լիգա": 90,
      "Իտալիայի Սերիա Ա": 85,
      "Գերմանիայի Բունդեսլիգա": 85,
      "Ֆրանսիայի Լիգա 1": 80,
      "Եվրոպա լիգա": 70,
      "Կոնֆերենցիաների լիգա": 60,
      "Սաուդյան Արաբիայի պրոֆեսիոնալ լիգա": 40,
      "MLS": 40,
    };
    finished.sort((a, b) => (COMPETITION_PRIORITY[b.competition] ?? 30) - (COMPETITION_PRIORITY[a.competition] ?? 30));
    log.push(`recap debug: total=${matches.length}, finished=${finished.length} (${finished.map((m) => `${m.home}-${m.away}/${m.competition}`).join(", ")})`);
    for (const match of finished) {
      if (generated >= MAX_PER_TYPE || attempted >= MAX_ATTEMPTS) break;
      if (Date.now() > deadline) { log.push("recap: time budget exceeded, stopping early"); break; }
      const sourceUrl = `https://aifootball.am/live/match/${match.id}`;
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
        ...article, imageUrl: null, sourceName: "AIFootball", sourceUrl, uniquePart: match.id,
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
    // Same Armenia exclusion as runRecaps above.
    const upcoming = matches.filter((m) => !m.isLive && m.homeScore === null && m.competition !== "Հայաստանի Պրեմիեր լիգա");
    for (const match of upcoming) {
      if (generated >= MAX_PER_TYPE || attempted >= MAX_ATTEMPTS) break;
      if (Date.now() > deadline) { log.push("preview: time budget exceeded, stopping early"); break; }
      const sourceUrl = `https://aifootball.am/live/match/${match.id}#preview`;
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
        ...article, imageUrl: null, sourceName: "AIFootball", sourceUrl, uniquePart: `${match.id}-preview`,
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
  // BUG FIXED: the entity-search loop (checking each club/player in the
  // rotation chain for fresh content) used the same `deadline` as the
  // final generation step, so a long chain could consume the entire
  // budget just searching - finding genuinely new items but leaving zero
  // time to actually call the model and save an article from them
  // (observed: found 4 new items from an entity, but "time budget
  // exceeded" fired before generation ever ran, wasting the find).
  // Reserve the last 30s of the budget exclusively for the actual
  // fetch-page + generate + save sequence, so search stops early enough
  // to guarantee generation gets a real chance to run.
  const GENERATION_RESERVE_MS = 115_000;
  const searchDeadline = deadline - GENERATION_RESERVE_MS;
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
      if (Date.now() > searchDeadline) { log.push("rss: search time budget exceeded, stopping early"); break; }
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
            // BUG FIXED: previously this loop only stopped on time budget
            // or finding content, meaning a bad-luck cycle could burn
            // through dozens of entities in rapid sequential API calls -
            // this burst request pattern is very likely what triggered
            // APITube's 59% weekly error rate (their dashboard showed
            // this after we started expanding the entity pool). Capping
            // attempts per generation call keeps our request volume
            // spread out over the day instead of bursty - the rotating
            // starting point (rotationSeed changes every minute) still
            // covers the whole entity pool over multiple attempts, just
            // more gradually.
            const MAX_ENTITIES_PER_ATTEMPT = 40; // Raised 20->40 to match the expanded ~204-entity pool (was ~79)
            let entitiesTried = 0;
            for (const pick of pickCombinedChain(cycle, rotationSeed)) {
              if (entitiesTried >= MAX_ENTITIES_PER_ATTEMPT) { log.push(`rss: reached ${MAX_ENTITIES_PER_ATTEMPT}-entity cap for this attempt, stopping`); break; }
                if (Date.now() > searchDeadline) {
                log.push(`rss: search budget exhausted after ${entitiesTried} entities (cap ${MAX_ENTITIES_PER_ATTEMPT})`);
                break;
              }
              if (await isEntityOverrepresented(pick.value)) continue;
              entitiesTried++;
                            const entityStart = Date.now();
              const found = pick.filterType === "title"
                ? await fetchApiTubeTitle(apiTubeKey, pick.value, 30)
                : await fetchApiTubePerson(apiTubeKey, pick.value, 30);
                                         log.push(`rss debug: [${pick.filterType}] ${pick.value} -> ${found.length} items (${Date.now() - entityStart}ms)`);
              // Small pause between successive entity searches - APITube's
              // dashboard showed a 59% error rate, and this chain can make
              // many rapid back-to-back calls with no spacing when
              // exhausting a long entity list looking for fresh content.
              // BUG FIXED: this 300ms delay was a guess and turned out to
              // be wildly insufficient - confirmed via APITube's own
              // dashboard plan comparison table that the free tier's rate
              // limit is 10 requests/min (1 every 6s on average), not
              // something a 300ms gap comes anywhere close to respecting.
              // 20 entities at 300ms apart = 6s total, versus the ~120s
              // that pacing at the real limit would actually take. This
              // was very likely causing near-total rate-limit failures on
              // every multi-entity search attempt.
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
              // DEDUP DISABLED per explicit request, prioritizing publish
              // frequency over avoiding topically-similar repeats. Kept
              // articleExistsForSource (exact source URL dedup) since
              // that prevents literally reprocessing the same source
              // article twice - only the topic-similarity check
              // (isTopicRecentlyCovered) is disabled here.
              const newItems: FeedItem[] = [];
              for (const candidate of found) {
                if (await articleExistsForSource(candidate.link)) continue;
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
        // lastGenerationDebug is otherwise only recorded on failure, which
        // would make a SUCCESSFUL Gemini rescue invisible - exactly the
        // case worth seeing, since it means the Anthropic balance is gone
        // and articles are being written by the cheaper fallback model.
        if (lastGenerationDebug.startsWith("CLAUDE BILLING FAILURE")) log.push(`!! ${lastGenerationDebug.slice(0, 300)}`);
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

// Observability: record every invocation's outcome in D1 so we can see
// exactly what the automated (cron-job.org / backup-cron.yml) ticks are
// doing, instead of inferring it. Their curl output is fully suppressed
// (-s ... || true), so until now every question about "what did the
// natural tick do?" was answered by guessing. Fire-and-forget, never
// blocks or fails the main response.
async function logInvocation(entry: { forced: string | null; mode: string; generated: number; reason?: string; log?: string[] }): Promise<void> {
  try {
    const { env } = await import("cloudflare:workers");
    const db = (env as unknown as { DB?: D1Database }).DB;
    if (!db) return;
    await db.prepare(`CREATE TABLE IF NOT EXISTS cron_invocations (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, forced TEXT, mode TEXT, generated INTEGER, reason TEXT, log TEXT)`).run();
    await db.prepare(`INSERT INTO cron_invocations(ts,forced,mode,generated,reason,log) VALUES(?,?,?,?,?,?)`)
      .bind(new Date().toISOString(), entry.forced, entry.mode, entry.generated, entry.reason ?? null, JSON.stringify((entry.log ?? []).slice(0, 40)))
      .run();
  } catch {
    // never let logging break the pipeline
  }
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

  // Publishing window: 10:00-03:00 Yerevan time (UTC+4, no DST). Manual
  // ?mode= calls bypass the window so testing works any time of day.
  const yerevanHour = (new Date().getUTCHours() + 4) % 24;
  if (!forcedMode) {
    const inWindow = yerevanHour >= 10 || yerevanHour < 3;
    if (!inWindow) {
      await logInvocation({ forced: forcedMode, mode: "skipped", generated: 0, reason: "outside window" });
      return Response.json({ ok: true, mode: "skipped", reason: "outside 10:00-03:00 Yerevan publishing window", generated: 0, log: [] });
    }
  }

  // Publish at most 1 article per 20-minute window (0-19, 20-39, 40-59),
  // gated on "already published an article in this UTC hour AND this
  // 20-minute window". RSS only - no automatic recap.
  const nowForSlot = new Date();
  let slotClaimKey: string | null = null;
  let claimDb: D1Database | null = null;
  if (!forcedMode) {
    try {
      const { getDb } = await import("../../../../db");
      const { articles } = await import("../../../../db/schema");
      const { desc } = await import("drizzle-orm");
      const db = await getDb();
      const recent = await db.select({ publishedAt: articles.publishedAt }).from(articles).orderBy(desc(articles.id)).limit(3);
      const currentWindow = Math.floor(nowForSlot.getUTCMinutes() / 20);
      const sameHourWindowCount = recent.filter((row) => {
        if (!row.publishedAt) return false;
        const d = new Date(row.publishedAt.replace(" ", "T") + "Z");
        return d.getUTCFullYear() === nowForSlot.getUTCFullYear()
          && d.getUTCMonth() === nowForSlot.getUTCMonth()
          && d.getUTCDate() === nowForSlot.getUTCDate()
          && d.getUTCHours() === nowForSlot.getUTCHours()
          && Math.floor(d.getUTCMinutes() / 20) === currentWindow;
      }).length;
      if (sameHourWindowCount > 0) {
        await logInvocation({ forced: forcedMode, mode: "skipped", generated: 0, reason: "already published this window" });
        return Response.json({ ok: true, mode: "skipped", reason: "already published an article in this 20-minute window", generated: 0, log: [] });
      }
      // BUG FIXED: this used `db` (a Drizzle instance from getDb()),
      // calling .prepare() on it - but .prepare() is raw D1's API, not
      // Drizzle's, so it threw every single time. The catch below then
      // misreported that as "already claimed by a concurrent request"
      // and skipped. Net effect: EVERY natural cron tick silently bailed
      // out here before ever attempting generation, while forced ?mode=
      // calls skipped this whole block and worked fine - exactly the
      // "manual works, automatic never does" pattern seen all day.
      // Use the raw D1 binding, like every other helper in this file.
      const key = `window_claim:${nowForSlot.getUTCFullYear()}-${nowForSlot.getUTCMonth()}-${nowForSlot.getUTCDate()}-${nowForSlot.getUTCHours()}-${currentWindow}`;
      const { env: claimEnv } = await import("cloudflare:workers");
      const rawDb = (claimEnv as unknown as { DB?: D1Database }).DB;
      if (rawDb) {
        slotClaimKey = key;
        claimDb = rawDb;
        try {
          await rawDb.prepare(`CREATE TABLE IF NOT EXISTS api_cache (cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL DEFAULT '[]',saved_at INTEGER NOT NULL DEFAULT 0,retry_after INTEGER NOT NULL DEFAULT 0)`).run();
          await rawDb.prepare(`INSERT INTO api_cache(cache_key,payload,saved_at,retry_after) VALUES(?,'claimed',?,0)`).bind(key, Date.now()).run();
        } catch {
          await logInvocation({ forced: forcedMode, mode: "skipped", generated: 0, reason: "window already claimed" });
          return Response.json({ ok: true, mode: "skipped", reason: "window already claimed by a concurrent request", generated: 0, log: [] });
        }
      }
    } catch {
      // If the check itself fails for some reason, fall through and
      // attempt generation anyway rather than silently skipping forever.
    }
  }
  const deadline = Date.now() + TIME_BUDGET_MS;
  const log: string[] = [];
  let generated = 0;
  let mode = forcedMode ?? "rss";
  if (mode === "recap") generated = await runRecaps(claudeApiKey, log, deadline);
  else if (mode === "preview") generated = await runPreviews(claudeApiKey, log, deadline);
  else generated = await runRss(claudeApiKey, log, deadline, url.searchParams.get("source"), url.searchParams.get("titleQuery"));

  // BUG FIXED: the slot claim above was inserted unconditionally before
  // generation ran, but was never released if generation found nothing -
  // so the FIRST attempt in a slot (even a failed, empty one) would
  // permanently block every subsequent attempt in that same slot from
  // even trying with different entities, drastically cutting real
  // attempts per slot despite having 60+ tracked names. Delete the claim
  // when generation produced nothing, so the next dispatch tick within
  // the same slot can retry with a fresh entity rotation instead of
  // being blocked by a claim that never actually produced an article.
  if (generated === 0 && slotClaimKey && claimDb) {
    try {
      await claimDb.prepare(`DELETE FROM api_cache WHERE cache_key=?`).bind(slotClaimKey).run();
    } catch {
      // Non-critical if this cleanup fails - worst case the slot stays
      // claimed until the next slot boundary.
    }
  }

  await logInvocation({ forced: forcedMode, mode, generated, reason: generated > 0 ? "generated" : "nothing found", log });
  return Response.json({ ok: true, mode, generated, log });
}
