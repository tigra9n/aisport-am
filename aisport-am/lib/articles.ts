import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { articles } from "../db/schema";

export type NewsArticle = typeof articles.$inferSelect;

export async function getPublishedArticles(limit = 20): Promise<NewsArticle[]> {
  try {
    return await (await getDb())
      .select()
      .from(articles)
      .where(eq(articles.status, "published"))
      .orderBy(desc(articles.importance), desc(articles.publishedAt))
      .limit(limit);
  } catch {
    return [];
  }
}

export async function getArticleBySlug(slug: string): Promise<NewsArticle | null> {
  try {
    const [article] = await (await getDb())
      .select()
      .from(articles)
      .where(eq(articles.slug, slug))
      .limit(1);
    return article ?? null;
  } catch {
    return null;
  }
}
