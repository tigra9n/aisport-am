import type { MetadataRoute } from "next";
import { getPublishedArticles } from "../lib/articles";
import { getOpinions } from "../lib/opinions";
import { categories } from "../lib/content";
import { LEAGUE_TAGS } from "../lib/league-tags";

// force-dynamic alone has been observed to still let this metadata route
// get frozen at its build-time snapshot in this Workers build pipeline
// (confirmed: every static entry's lastModified stayed pinned to one
// exact build timestamp across multiple later deploys, and a deleted
// article kept appearing). Pairing it with revalidate=0 is the standard
// belt-and-suspenders fix for Next.js metadata routes.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const BASE_URL = "https://aifootball.am";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, lastModified: now, changeFrequency: "always", priority: 1 },
    { url: `${BASE_URL}/live`, lastModified: now, changeFrequency: "always", priority: 0.9 },
    { url: `${BASE_URL}/standings`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE_URL}/armenia`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${BASE_URL}/podcasts`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${BASE_URL}/opinions`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${BASE_URL}/topscorers`, lastModified: now, changeFrequency: "daily", priority: 0.5 },
    { url: `${BASE_URL}/search`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];

  const categoryPages: MetadataRoute.Sitemap = categories.map((c) => ({
    url: `${BASE_URL}/category/${c.slug}`,
    lastModified: now,
    changeFrequency: "hourly",
    priority: 0.6,
  }));

  // The league pages were missing entirely. They are the same kind of page
  // as the category ones - a per-competition landing page that fills itself
  // from new articles - and they carry the internal links that lead a
  // crawler to the individual articles.
  const leaguePages: MetadataRoute.Sitemap = LEAGUE_TAGS.map((league) => ({
    url: `${BASE_URL}/league/${league.code}`,
    lastModified: now,
    changeFrequency: "hourly",
    priority: 0.6,
  }));

  // Team/player/coach/match pages are keyed by API-Football's own numeric
  // IDs, not stored in our D1 - there's no local list of "every team we
  // know about" to enumerate without making a fresh external API call per
  // league/team on every single sitemap.xml request (this route is
  // force-dynamic, so that cost would be paid on every crawl, including
  // repeated Googlebot hits, and risks the API-Football rate limit).
  // Deliberately out of scope for now; these pages are still reachable
  // and indexable via normal internal links (standings, squads,
  // match-preview articles), just not proactively listed in the sitemap.
  // Article coverage is the primary Google News-relevant content type
  // and gets full sitemap treatment below.
  const articles = await getPublishedArticles(2000);
  const articlePages: MetadataRoute.Sitemap = articles.map((a) => ({
    url: `${BASE_URL}/news/${a.slug}`,
    lastModified: new Date(a.publishedAt + "Z"),
    changeFrequency: "daily",
    priority: 0.8,
  }));

  // These are Tigran's own hand-written pieces - the site's most unique,
  // highest-value content for search (not AI-rewritten wire content) -
  // yet weren't proactively listed here at all before, only the generic
  // /opinions list page was. Priority set slightly above regular news
  // articles for that reason.
  const opinions = await getOpinions(200);
  const opinionPages: MetadataRoute.Sitemap = opinions.map((o) => ({
    url: `${BASE_URL}/opinions/${o.slug}`,
    lastModified: new Date(o.publishedAt + "Z"),
    changeFrequency: "weekly",
    priority: 0.85,
  }));

  return [...staticPages, ...categoryPages, ...leaguePages, ...articlePages, ...opinionPages];
}
