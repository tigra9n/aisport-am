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

export async function articleExistsForSource(sourceUrl: string): Promise<boolean> {
  try {
    const [row] = await (await getDb())
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.sourceUrl, sourceUrl))
      .limit(1);
    return Boolean(row);
  } catch {
    return false;
  }
}

function slugify(title: string, uniquePart: string) {
  const transliterated = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join("-");
  return `${transliterated || "news"}-${uniquePart}`.slice(0, 120);
}

// Returns true if a new row was inserted, false if it already existed
// (sourceUrl is unique, so re-processing the same match/feed item is safe).
export async function saveGeneratedArticle(input: {
  title: string;
  excerpt: string;
  content: string;
  category: string;
  imageUrl?: string | null;
  sourceName: string;
  sourceUrl: string;
  uniquePart: string;
}): Promise<boolean> {
  try {
    const db = await getDb();
    const result = await db
      .insert(articles)
      .values({
        slug: slugify(input.title, input.uniquePart),
        title: input.title,
        excerpt: input.excerpt,
        content: input.content,
        category: input.category,
        imageUrl: input.imageUrl ?? null,
        sourceName: input.sourceName,
        sourceUrl: input.sourceUrl,
        status: "published",
      })
      .onConflictDoNothing({ target: articles.sourceUrl })
      .returning({ id: articles.id });
    return result.length > 0;
  } catch (err) {
    console.error(`[articles] save failed: ${String(err)}`);
    return false;
  }
}
