// APITube's free tier doesn't support the `export=rss` format (403:
// "Export formats are not available on the free plan"), but the plain
// JSON endpoint works fine on free. This route fetches the JSON and
// re-serves it as standard RSS 2.0 XML, so lib/feeds.ts's existing RSS
// parser can consume it unchanged - no need for a second code path just
// for one source.
export const dynamic = "force-dynamic";

function escapeXml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

type ApiTubeArticle = {
  title?: string;
  href?: string;
  description?: string;
  body?: string;
  published_at?: string;
  image?: string;
};

// category.id=medtop:15000000 (IPTC "Sport") returns mostly-sports results
// on APITube's free tier, but not exclusively - real-world sample included
// a car review, "Letters to the Editor", and outright spam ("...Hacked By
// Tiger" gambling junk). Keyword-filter as a second pass since there's no
// reliable stricter category/topic filter available on the free plan.
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const apiKey = url.searchParams.get("api_key");
  if (!apiKey) {
    return new Response("<?xml version=\"1.0\"?><rss version=\"2.0\"><channel></channel></rss>", {
      headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
    });
  }
  const perPage = url.searchParams.get("per_page") ?? "20";
  const categoryId = url.searchParams.get("category_id") ?? "medtop:15000000";

  let articles: ApiTubeArticle[] = [];
  let rawCount = 0;
  let fetchError = "";
  try {
    // Free tier caps per_page at 10 (ER0171 for anything higher). The
    // keyword filter below discards some of these as off-topic/spam, so
    // yield per tick is modest, but that's fine - we only need 1 usable
    // item per cron tick anyway.
    const apiUrl = `https://api.apitube.io/v1/news/everything?api_key=${encodeURIComponent(apiKey)}&category.id=${encodeURIComponent(categoryId)}&per_page=10&language.code=en&sort.by=published_at&sort.order=desc`;
    const res = await fetch(apiUrl, { headers: { "Content-Type": "application/json" } });
    if (res.ok) {
      const data = await res.json() as { results?: ApiTubeArticle[] };
      const raw = data.results ?? [];
      rawCount = raw.length;
      articles = raw.filter(looksLikeSportsArticle).slice(0, Number(perPage) || 20);
    } else {
      fetchError = `http ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`;
    }
  } catch (err) {
    fetchError = String(err);
  }

  if (url.searchParams.get("debug") === "1") {
    return Response.json({ rawCount, filteredCount: articles.length, fetchError, sample: articles.slice(0, 3).map((a) => a.title) });
  }

  const items = articles.map((a) => {
    const title = escapeXml(a.title ?? "");
    const link = escapeXml(a.href ?? "");
    const description = escapeXml((a.description ?? a.body ?? "").slice(0, 500));
    const pubDate = a.published_at ? new Date(a.published_at).toUTCString() : "";
    const image = a.image ? `<enclosure url="${escapeXml(a.image)}" type="image/jpeg" />` : "";
    return `<item><title>${title}</title><link>${link}</link><guid>${link}</guid><description>${description}</description>${pubDate ? `<pubDate>${pubDate}</pubDate>` : ""}${image}</item>`;
  }).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>APITube Sport</title><link>https://apitube.io</link><description>APITube sport category bridge</description>${items}</channel></rss>`;

  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
