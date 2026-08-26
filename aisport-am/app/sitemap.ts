import type { MetadataRoute } from "next";
import { getPublishedArticles } from "../lib/articles";
import { categories } from "../lib/content";

export const dynamic = "force-dynamic";

const BASE_URL = "https://aisport.am";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, changeFrequency: "always", priority: 1 },
    { url: `${BASE_URL}/live`, changeFrequency: "always", priority: 0.9 },
    { url: `${BASE_URL}/standings`, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE_URL}/armenia`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${BASE_URL}/podcasts`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${BASE_URL}/opinions`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${BASE_URL}/topscorers`, changeFrequency: "daily", priority: 0.5 },
    { url: `${BASE_URL}/search`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];

  const categoryPages: MetadataRoute.Sitemap = categories.map((c) => ({
    url: `${BASE_URL}/category/${c.slug}`,
    changeFrequency: "hourly",
    priority: 0.6,
  }));

  const articles = await getPublishedArticles(500);
  const articlePages: MetadataRoute.Sitemap = articles.map((a) => ({
    url: `${BASE_URL}/news/${a.slug}`,
    lastModified: new Date(a.publishedAt + "Z"),
    changeFrequency: "daily",
    priority: 0.8,
  }));

  return [...staticPages, ...categoryPages, ...articlePages];
}
