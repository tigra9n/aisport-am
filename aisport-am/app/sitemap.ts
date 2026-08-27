import type { MetadataRoute } from "next";
import { getPublishedArticles } from "../lib/articles";
import { categories } from "../lib/content";

export const dynamic = "force-dynamic";

const BASE_URL = "https://aisport.am";

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

  return [...staticPages, ...categoryPages, ...articlePages];
}
