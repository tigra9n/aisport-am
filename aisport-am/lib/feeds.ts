export type FeedItem = { title: string; link: string; snippet: string; imageUrl: string | null; pubDate: string | null };

function decodeEntities(text: string) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// response.text() always assumes UTF-8, which corrupts non-UTF-8 feeds
// (e.g. Turkish sports RSS served as windows-1254) into replacement
// characters ("Fenerbahçe" -> "�enerbah�e"). Sniff the real charset from
// the Content-Type header first, then the XML declaration, and decode
// the raw bytes with that charset before any further processing.
function detectCharset(contentType: string | null, headBytes: Uint8Array): string {
  const headerMatch = contentType?.match(/charset=["']?([\w-]+)/i);
  if (headerMatch) return headerMatch[1].toLowerCase();
  // XML declarations are always ASCII-safe in the prolog, so a plain
  // latin1 decode of the first bytes is safe purely for sniffing purposes.
  const head = new TextDecoder("windows-1252").decode(headBytes.slice(0, 1024));
  const xmlMatch = head.match(/<\?xml[^>]*encoding=["']([\w-]+)["']/i);
  if (xmlMatch) return xmlMatch[1].toLowerCase();
  // HTML pages declare charset via <meta charset="..."> or the older
  // <meta http-equiv="Content-Type" content="...charset=...">.
  const htmlMetaMatch = head.match(/<meta[^>]+charset=["']?([\w-]+)/i);
  if (htmlMetaMatch) return htmlMetaMatch[1].toLowerCase();
  return "utf-8";
}

async function decodeHttpResponse(response: Response): Promise<string> {
  const buffer = new Uint8Array(await response.arrayBuffer());
  const charset = detectCharset(response.headers.get("content-type"), buffer);
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    // Unknown/unsupported label - fall back to UTF-8 rather than throwing.
    return new TextDecoder("utf-8").decode(buffer);
  }
}

function extractTag(block: string, tag: string): string | null {
  const cdataMatch = block.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i"));
  if (cdataMatch) return decodeEntities(cdataMatch[1].trim());
  const plainMatch = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (plainMatch) return decodeEntities(plainMatch[1].replace(/<[^>]+>/g, "").trim());
  return null;
}

function extractImage(block: string): string | null {
  // Attribute order varies between feeds (url before type, or vice versa),
  // so match each attribute independently rather than requiring a fixed
  // order - this was silently failing to extract images from some feeds
  // (e.g. ESPN), causing articles to fall back to a generic per-category
  // stock photo instead of a real per-article image.
  const enclosureMatch = block.match(/<enclosure\b([^>]*)\/?>/i);
  if (enclosureMatch) {
    const attrs = enclosureMatch[1];
    const typeMatch = attrs.match(/type=["']([^"']+)["']/i);
    const urlMatch = attrs.match(/url=["']([^"']+)["']/i);
    if (urlMatch && (!typeMatch || /^image/i.test(typeMatch[1]))) return urlMatch[1];
  }
  const mediaContent = block.match(/<media:content\b[^>]*url=["']([^"']+)["']/i);
  if (mediaContent) return mediaContent[1];
  const thumbnail = block.match(/<media:thumbnail\b[^>]*url=["']([^"']+)["']/i);
  if (thumbnail) return thumbnail[1];
  const imgTag = block.match(/<img\b[^>]*src=["']([^"']+)["']/i);
  return imgTag ? imgTag[1] : null;
}

export async function fetchFeed(feedUrl: string, limit = 10): Promise<FeedItem[]> {
  // Special-cased: URLs pointing at our own /api/feeds/apitube bridge are
  // fetched directly against api.apitube.io instead of self-fetching our
  // own domain. Worker-initiated self-fetch (this Worker calling its own
  // production URL, which then makes ANOTHER outbound fetch) reliably
  // returned zero items in production despite the exact same URL working
  // fine via an external curl - looks like Cloudflare Workers' nested
  // self-fetch handling silently drops the inner request in this chain
  // (scheduled -> cron endpoint -> bridge -> apitube.io was one hop too
  // many). Calling api.apitube.io directly removes that hop entirely.
  if (feedUrl.includes("/api/feeds/apitube")) {
    return fetchApiTubeDirect(feedUrl, limit);
  }
  try {
    const response = await fetch(feedUrl, { headers: { "User-Agent": "AISportBot/1.0 (+https://aisport.am)" } });
    if (!response.ok) return [];
    const xml = await decodeHttpResponse(response);
    const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
    return items.slice(0, limit).map((block) => ({
      title: extractTag(block, "title") ?? "",
      link: (extractTag(block, "link") ?? extractTag(block, "guid") ?? "").trim(),
      snippet: (extractTag(block, "description") ?? extractTag(block, "summary") ?? "").slice(0, 500),
      imageUrl: extractImage(block),
      pubDate: extractTag(block, "pubDate"),
    })).filter((item) => item.title && item.link);
  } catch (err) {
    console.error(`[feeds] fetch failed for ${feedUrl}: ${String(err)}`);
    return [];
  }
}

type ApiTubeArticle = {
  title?: string;
  href?: string;
  description?: string;
  body?: string;
  published_at?: string;
  image?: string;
};

// Same keyword/spam filter as the (now-unused-internally) bridge route -
// category.id=medtop:15000000 returns mostly-sports results on APITube's
// free tier, but not exclusively (car reviews, "Letters to the Editor",
// outright gambling spam, and even unrelated academic papers have all
// shown up in real samples - a pediatric lupus research article got
// through because "score" and "team" are common in clinical/academic
// writing too, e.g. disease activity scores, research teams).
//
// Also found: an opera review (Salzburg Festival's "Carmen") slipped
// through APITube's own "Sport" category tagging entirely and matched
// one of the SPORT_KEYWORDS below (opera reviews use words like "cup",
// "team", "champion" loosely too - e.g. "the champion of this staging").
// Classical-music vocabulary is specific enough to safely exclude
// outright, and the one confirmed source domain is blocked directly as
// defense in depth (same pattern as EXCLUDE_DOMAINS for academic sites).
const SPORT_KEYWORDS = [
  "football", "soccer", "basketball", "nba", "nfl", "mlb", "nhl", "tennis",
  "cricket", "rugby", "hockey", "boxing", "mma", "ufc", "golf", "olympic",
  "athletics", "marathon", "cycling", "f1", "formula 1", "league", " cup",
  "championship", "tournament", "playoff", "stadium", "transfer window",
  "head coach", "match", "juventus", "madrid", "barcelona", "liverpool",
  "chelsea", "arsenal", "manchester", "bayern", " psg", "wimbledon",
];
// Generic words alone are too ambiguous ("team", "score", "coach", "goal",
// "champion", "medal", "player", "club" are all common outside sports -
// research team, credit score, life coach, career goal, champion a cause,
// gold medal in academia, film player, book club) - dropped as standalone
// triggers. Multi-word phrases above stay specific enough to keep.
const EXCLUDE_KEYWORDS = [
  "cohort", "clinical", "patient", "diagnosis", "diagnosed", "syndrome",
  "disease", "lupus", "therapy", "remission", "journal of", "peer-review",
  "gambling", "casino", "deposit bonus", "letters to the editor",
  "opera", "festspielhaus", "choreograph", "libretto", "soprano",
  "orchestra", "philharmonic", "conductor", "aria", "ballet", "symphony",
];
const SPAM_PATTERNS = ["hacked by", "deposit", "casino", "gambling site", "bonus code", "free spins"];
// Academic/research repositories never publish sports news - an extra
// safety net independent of keyword matching, since keyword filters alone
// missed the lupus research article (it happened to mention things like
// "score" and "team" in a clinical context). planethugill.com is an opera
// review blog (confirmed source of the Salzburg Festival false positive).
const EXCLUDE_DOMAINS = ["unizar.es", "arxiv.org", "pubmed.ncbi.nlm.nih.gov", "sciencedirect.com", "springer.com", "researchgate.net", "jstor.org", "ncbi.nlm.nih.gov", "planethugill.com"];

function looksLikeSportsArticle(a: ApiTubeArticle): boolean {
  const text = `${a.title ?? ""} ${a.description ?? ""}`.toLowerCase();
  if (SPAM_PATTERNS.some((p) => text.includes(p))) return false;
  if (EXCLUDE_KEYWORDS.some((p) => text.includes(p))) return false;
  if (a.href && EXCLUDE_DOMAINS.some((d) => a.href!.includes(d))) return false;
  return SPORT_KEYWORDS.some((k) => text.includes(k));
}

// Same spam/exclude checks as looksLikeSportsArticle, but without
// requiring a generic sport keyword match - used for entity-filtered
// (organization.name/person.name/event.name) queries, where the entity
// filter itself is already a strong football-relevance signal. A
// transfer-rumor headline about a named player, for example, may not
// contain words like "match" or "league" at all.
function passesSpamCheck(a: ApiTubeArticle): boolean {
  const text = `${a.title ?? ""} ${a.description ?? ""}`.toLowerCase();
  if (SPAM_PATTERNS.some((p) => text.includes(p))) return false;
  if (EXCLUDE_KEYWORDS.some((p) => text.includes(p))) return false;
  if (a.href && EXCLUDE_DOMAINS.some((d) => a.href!.includes(d))) return false;
  return true;
}

function mapApiTubeResults(results: ApiTubeArticle[], limit: number, useEntitySafetyCheck = false): FeedItem[] {
  const filtered = results.filter(useEntitySafetyCheck ? passesSpamCheck : looksLikeSportsArticle);
  return filtered.slice(0, limit)
    .map((a) => {
      const desc = a.description ?? "";
      const body = a.body ?? "";
      const best = body.length > desc.length ? body : desc;
      return {
        title: a.title ?? "",
        link: a.href ?? "",
        snippet: best.slice(0, 2000),
        imageUrl: a.image ?? null,
        pubDate: a.published_at ?? null,
      };
    })
    .filter((item) => item.title && item.link);
}

// Trusted football-news domains only. This replaces relying purely on
// keyword/domain blacklists (EXCLUDE_KEYWORDS/EXCLUDE_DOMAINS above),
// which is inherently reactive - each surprise category that slips past
// APITube's own "Sport" tagging (opera reviews, academic papers, car
// reviews, gambling spam, all seen in practice) needed a new keyword
// added after the fact. A domain whitelist is proactive: only known
// football outlets are ever considered, so an unrelated category simply
// can't appear regardless of how APITube mis-tags it.
//
// IMPORTANT: applied client-side, not via APITube's source.domain= query
// param. Confirmed by direct testing: source.domain works fine with
// exactly one value, but returns status "not_ok" / zero results the
// moment a second value is added (comma-separated or otherwise) -
// combining any 2+ domains does not work on this account/plan, silently
// breaking every entity search that used it (root cause of a full window
// producing zero articles). Fetching without the filter and checking each
// result's actual domain in code sidesteps the API-side limitation
// entirely.
const TRUSTED_FOOTBALL_DOMAINS = [
  // Major / top-tier outlets
  "skysports.com", "bbc.com", "espn.com", "marca.com", "as.com",
  "lequipe.fr", "football-italia.net", "goal.com", "football365.com",
  "transfermarkt.com", "theathletic.com", "90min.com", "onefootball.com",
  "fourfourtwo.com", "givemesport.com", "mirror.co.uk", "standard.co.uk",
  "independent.co.uk", "theguardian.com", "eurosport.com", "uefa.com",
  "fifa.com", "premierleague.com", "bundesliga.com", "gazzetta.it",
  "footmercato.net", "rmcsport.bfmtv.com", "sport.es", "mundodeportivo.com",
  // Wider-coverage / high-volume outlets, added for broader daily pickup
  "bleacherreport.com", "sportsmole.co.uk", "sportbible.com", "teamtalk.com",
  "caughtoffside.com", "footballtransfers.com", "football-espana.net",
  "planetfootball.com", "calciomercato.com", "tuttomercatoweb.com",
  "kicker.de", "sportskeeda.com", "dailystar.co.uk", "get-french-football-news.com",
  // Second expansion - more high-volume/football-focused outlets, added
  // after observing occasional empty 20-minute windows (no fresh,
  // distinct-topic article from the existing list at that moment).
  "football.london", "talksport.com", "si.com", "metro.co.uk",
  "express.co.uk", "telegraph.co.uk", "squawka.com", "sofoot.com",
  "record.pt", "abola.pt", "laliga.com", "worldsoccertalk.com",
  "vavel.com", "the-sun.com", "sportsillustrated.com",
];

function isTrustedFootballDomain(href: string | undefined | null): boolean {
  if (!href) return false;
  try {
    const hostname = new URL(href).hostname.toLowerCase().replace(/^www\./, "");
    return TRUSTED_FOOTBALL_DOMAINS.some((d) => hostname === d || hostname.endsWith("." + d));
  } catch {
    return false;
  }
}

// APITube's own sort.by=published_at ordering isn't fully reliable on its
// own - a Sky Sports article carrying a January publish date still showed
// up as if fresh, with no date filter to catch it. Explicitly restrict to
// the last few days via published_at.start so a stale article can't slip
// through regardless of how the API sorts/dates it internally.
function recentSinceParam(days = 3): string {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return cutoff.toISOString().slice(0, 10);
}

async function fetchApiTubeDirect(bridgeUrl: string, limit: number): Promise<FeedItem[]> {
  try {
    const params = new URL(bridgeUrl).searchParams;
    const apiKey = params.get("api_key");
    const categoryId = params.get("category_id") ?? "medtop:15000000";
    if (!apiKey) return [];
    // Starter plan allows up to 50 results per page (was capped at 10 on
    // free tier). More candidates per tick means fewer "everything in the
    // window is already published, nothing new to pick" empty ticks.
    const apiUrl = `https://api.apitube.io/v1/news/everything?api_key=${encodeURIComponent(apiKey)}&category.id=${encodeURIComponent(categoryId)}&published_at.start=${recentSinceParam()}&per_page=50&language.code=en&sort.by=published_at&sort.order=desc`;
    const res = await fetch(apiUrl, { headers: { "Content-Type": "application/json" } });
    if (!res.ok) return [];
    const data = await res.json() as { results?: ApiTubeArticle[] };
    const trusted = (data.results ?? []).filter((a) => isTrustedFootballDomain(a.href));
    return mapApiTubeResults(trusted, limit);
  } catch (err) {
    console.error(`[feeds] apitube direct fetch failed: ${String(err)}`);
    return [];
  }
}

// APITube error codes indicating a bad/unsupported filter value - only
// relevant for person.name (title search doesn't return "not found"
// errors, it just returns fewer/no results).
const BAD_VALUE_ERROR_CODES = ["ER0151", "ER0216", "ER0220", "ER0228"];

// Football-focused named-entity query for players/coaches. See
// lib/football-entities.ts for the list and priority rotation this is
// called with, and for why it's one name at a time rather than a
// comma-separated OR list (a single unrecognized name fails the whole
// request).
export async function fetchApiTubePerson(apiKey: string, personName: string, limit: number): Promise<FeedItem[]> {
  try {
    const apiUrl = `https://api.apitube.io/v1/news/everything?api_key=${encodeURIComponent(apiKey)}&person.name=${encodeURIComponent(personName)}&published_at.start=${recentSinceParam()}&per_page=50&language.code=en&sort.by=published_at&sort.order=desc`;
    const res = await fetch(apiUrl, { headers: { "Content-Type": "application/json" } });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      if (BAD_VALUE_ERROR_CODES.some((code) => bodyText.includes(code))) {
        const { quarantineValue } = await import("./football-entities");
        quarantineValue(personName);
      }
      return [];
    }
    const data = await res.json() as { results?: ApiTubeArticle[] };
    // APITube's person.name entity tagging isn't always accurate - found
    // a completely unrelated fast-food app launch article tagged as
    // being about "Henrikh Mkhitaryan" (the name appeared nowhere in the
    // title or description). Don't trust the entity tag blindly: require
    // at least the person's surname to actually appear in the text as an
    // extra sanity check on top of APITube's own classification.
    const surname = personName.trim().split(/\s+/).pop()?.toLowerCase() ?? "";
    const verified = (data.results ?? []).filter((a) => {
      if (!isTrustedFootballDomain(a.href)) return false;
      if (!surname) return true;
      return `${a.title ?? ""} ${a.description ?? ""}`.toLowerCase().includes(surname);
    });
    return mapApiTubeResults(verified, limit, true);
  } catch (err) {
    console.error(`[feeds] apitube person fetch failed (${personName}): ${String(err)}`);
    return [];
  }
}

// Club-focused query: clubs aren't in APITube's tagged organization
// entity taxonomy (confirmed: "Real Madrid", "Manchester United" both
// "not found" as organization.name), but a plain title= free-text search
// works well (confirmed real, on-topic results for title=Real Madrid).
// language.code is omitted here since title search already found
// English/Spanish/French results for the same query - restricting
// language would just narrow an already-working search unnecessarily.
//
// BUG FOUND: title="Salzburg" (a club name that's also an Austrian city)
// pulled in a completely unrelated Salzburg Festival opera review with
// zero football content, published on-site tagged as football. Unlike
// fetchApiTubePerson (which verifies the surname actually appears in the
// text), this had no such check and no sports-category filter at all.
// Fixed the same way: restrict to the sports category (matches the plain
// category feed elsewhere in this file) AND require at least one
// football-context word near the club name, so a generic place-name
// collision like this can't slip through again.
const FOOTBALL_CONTEXT_WORDS = [
  "football", "soccer", "match", "goal", "league", "club", "fc", "coach",
  "manager", "striker", "midfielder", "defender", "transfer", "fixture",
  "squad", "stadium", "champions league", "europa league", "bundesliga",
  "premier league", "la liga", "serie a", "cup",
];

export async function fetchApiTubeTitle(apiKey: string, clubName: string, limit: number): Promise<FeedItem[]> {
  try {
    const apiUrl = `https://api.apitube.io/v1/news/everything?api_key=${encodeURIComponent(apiKey)}&title=${encodeURIComponent(clubName)}&category.id=medtop:15000000&published_at.start=${recentSinceParam()}&per_page=50&sort.by=published_at&sort.order=desc`;
    const res = await fetch(apiUrl, { headers: { "Content-Type": "application/json" } });
    if (!res.ok) return [];
    const data = await res.json() as { results?: ApiTubeArticle[] };
    const verified = (data.results ?? []).filter((a) => {
      if (!isTrustedFootballDomain(a.href)) return false;
      const text = `${a.title ?? ""} ${a.description ?? ""}`.toLowerCase();
      return FOOTBALL_CONTEXT_WORDS.some((w) => text.includes(w));
    });
    return mapApiTubeResults(verified, limit, true);
  } catch (err) {
    console.error(`[feeds] apitube title fetch failed (${clubName}): ${String(err)}`);
    return [];
  }
}

// Verifies an image URL actually resolves (HEAD 200) before we accept it -
// both APITube's own "image" field and og:image scraped from the source
// page have been observed to point at dead/404'd images (the source site
// itself had a stale meta tag or removed the file), which would otherwise
// get saved and shown as a broken picture on our article page.
export async function validateImageUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6_000);
    const res = await fetch(url, { method: "HEAD", signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0" } });
    clearTimeout(timeoutId);
    return res.ok ? url : null;
  } catch {
    return null;
  }
}

// Fetches the actual source article page once and pulls out (a) the
// og:image/twitter:image for a real per-story photo, and (b) a chunk of
// plain body text for much richer factual grounding than the short RSS
// snippet alone provides. Only called for the one item we're about to
// generate content for (not every item in a feed), so it's at most one
// extra request per cron tick.
//
// The short RSS snippet (title + ~1-2 sentence description) was leaving
// the model with almost nothing concrete to work with, so generated
// articles came out vague and name-less - it had no player/team names,
// scores, or quotes to draw from in the first place. Full body text
// gives it real material; the prompt still asks for original Armenian
// phrasing (not verbatim translation) but explicitly keeps real names,
// clubs, and numbers intact.
export async function fetchArticlePage(articleUrl: string): Promise<{ image: string | null; bodyText: string | null }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8_000);
    const response = await fetch(articleUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "AISportBot/1.0 (+https://aisport.am)" },
    });
    clearTimeout(timeoutId);
    if (!response.ok) return { image: null, bodyText: null };
    const html = await decodeHttpResponse(response);

    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
      ?? html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    // The og:image meta tag itself can be stale/broken on the source site
    // (e.g. cappertek.com pointed to a 404'd image) - verify it actually
    // loads before accepting it. Falls back to the category stock-photo
    // pool (handled by the caller) if this check fails.
    const image = await validateImageUrl(ogMatch?.[1]);

    // Crude but effective plain-text extraction: strip script/style/nav/
    // header/footer/noscript blocks and all remaining tags, collapse
    // whitespace. Not a real readability parser, but good enough to hand
    // the model actual sentences with names/numbers instead of nothing.
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const bodyText = stripped ? stripped.slice(0, 6_000) : null;

    return { image, bodyText };
  } catch {
    return { image: null, bodyText: null };
  }
}
