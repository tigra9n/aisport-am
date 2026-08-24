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

const HY_TO_LATIN: Record<string, string> = {
  "ա":"a","բ":"b","գ":"g","դ":"d","ե":"e","զ":"z","է":"e","ը":"y","թ":"t","ժ":"zh",
  "ի":"i","լ":"l","խ":"kh","ծ":"ts","կ":"k","հ":"h","ձ":"dz","ղ":"gh","չ":"ch",
  "մ":"m","յ":"y","ն":"n","շ":"sh","ո":"o","չ":"ch","պ":"p","ջ":"j","ռ":"r",
  "ս":"s","վ":"v","տ":"t","ր":"r","ց":"ts","ու":"u","փ":"p","ք":"q","օ":"o","ֆ":"f",
  "և":"ev",
};

function transliterateHy(text: string): string {
  return text
    .replace(/ու/g, "u")
    .replace(/[ա-և]/g, (ch) => HY_TO_LATIN[ch] ?? ch);
}

function slugify(title: string, uniquePart: string) {
  const transliterated = transliterateHy(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
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
