import { getPublishedArticles } from "../../lib/articles";

// A Google News sitemap, separate from sitemap.xml and running alongside it.
//
// Google News and Discover are their own source of traffic, reached through
// their own sitemap format, and they only look at what is fresh: the spec
// is articles from the last two days, at most 1000 of them. The ordinary
// sitemap keeps listing everything and is untouched.
//
// Dynamic for the same reason sitemap.ts is: a metadata route in this
// Workers pipeline has been seen frozen at its build-time snapshot, and a
// news sitemap that goes stale is worse than none at all.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const BASE_URL = "https://aifootball.am";
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 1000;

// & < > " ' in a headline would otherwise break the document.
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(): Promise<Response> {
  // published_at is stored without a zone and is UTC, as everywhere else in
  // the codebase; the "Z" makes that explicit to Date.
  const cutoff = Date.now() - TWO_DAYS_MS;
  const recent = (await getPublishedArticles(1200))
    .map((article) => ({ article, published: new Date(article.publishedAt + "Z") }))
    .filter(({ published }) => published.getTime() >= cutoff && !Number.isNaN(published.getTime()))
    .sort((a, b) => b.published.getTime() - a.published.getTime())
    .slice(0, MAX_ENTRIES);

  const entries = recent
    .map(({ article, published }) => `  <url>
    <loc>${BASE_URL}/news/${escapeXml(article.slug)}</loc>
    <news:news>
      <news:publication>
        <news:name>AIFootball</news:name>
        <news:language>hy</news:language>
      </news:publication>
      <news:publication_date>${published.toISOString()}</news:publication_date>
      <news:title>${escapeXml(article.title)}</news:title>
    </news:news>
  </url>`)
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${entries}
</urlset>
`;

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      // Googlebot may fetch this many times an hour; a few minutes of
      // caching costs nothing and the window is two days wide.
      "cache-control": "public, max-age=300",
    },
  });
}
