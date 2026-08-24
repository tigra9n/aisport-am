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
    const xml = await response.text();
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
// outright gambling spam have all shown up in real samples).
const SPORT_KEYWORDS = [
  "football", "soccer", "basketball", "nba", "nfl", "mlb", "nhl", "tennis",
  "cricket", "rugby", "hockey", "boxing", "mma", "ufc", "golf", "olympic",
  "athletics", "marathon", "cycling", "f1", "formula 1", "match", "league",
  "championship", "tournament", " cup", "coach", "goal", "score", "player",
  "team", "club", "stadium", "playoff", "finals", "medal", "champion",
  "transfer", "manager", "referee", "juventus", "madrid", "barcelona",
  "liverpool", "chelsea", "arsenal", "united", "bayern", "psg",
];
const SPAM_PATTERNS = ["hacked by", "deposit", "casino", "gambling site", "bonus code", "free spins"];

function looksLikeSportsArticle(a: ApiTubeArticle): boolean {
  const text = `${a.title ?? ""} ${a.description ?? ""}`.toLowerCase();
  if (SPAM_PATTERNS.some((p) => text.includes(p))) return false;
  return SPORT_KEYWORDS.some((k) => text.includes(k));
}

async function fetchApiTubeDirect(bridgeUrl: string, limit: number): Promise<FeedItem[]> {
  try {
    const params = new URL(bridgeUrl).searchParams;
    const apiKey = params.get("api_key");
    const categoryId = params.get("category_id") ?? "medtop:15000000";
    if (!apiKey) return [];
    // Free tier caps per_page at 10 (ER0171 for anything higher).
    const apiUrl = `https://api.apitube.io/v1/news/everything?api_key=${encodeURIComponent(apiKey)}&category.id=${encodeURIComponent(categoryId)}&per_page=10&language.code=en&sort.by=published_at&sort.order=desc`;
    const res = await fetch(apiUrl, { headers: { "Content-Type": "application/json" } });
    if (!res.ok) return [];
    const data = await res.json() as { results?: ApiTubeArticle[] };
    const filtered = (data.results ?? []).filter(looksLikeSportsArticle);
    return filtered.slice(0, limit)
      .map((a) => ({
        title: a.title ?? "",
        link: a.href ?? "",
        snippet: (a.description ?? a.body ?? "").slice(0, 500),
        imageUrl: a.image ?? null,
        pubDate: a.published_at ?? null,
      }))
      .filter((item) => item.title && item.link);
  } catch (err) {
    console.error(`[feeds] apitube direct fetch failed: ${String(err)}`);
    return [];
  }
}

// When the RSS item itself has no image, fetch the actual source article
// page and pull its og:image/twitter:image meta tag - a real photo tied
// to that specific story, instead of falling back to a generic
// per-category stock photo. Only called for the one item we're about to
// generate content for (not every item in a feed), so it's at most one
// extra request per cron tick.
export async function fetchArticleOgImage(articleUrl: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8_000);
    const response = await fetch(articleUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "AISportBot/1.0 (+https://aisport.am)" },
    });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    // Only read enough of the page to cover the <head> section - avoids
    // downloading a full article page just for one meta tag.
    const reader = response.body?.getReader();
    let html = "";
    if (reader) {
      const decoder = new TextDecoder();
      while (html.length < 60_000) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
        if (/<\/head>/i.test(html)) break;
      }
      reader.cancel().catch(() => {});
    } else {
      html = await response.text();
    }
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
      ?? html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
    return ogMatch ? ogMatch[1] : null;
  } catch {
    return null;
  }
}
