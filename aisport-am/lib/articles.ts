import { and, desc, eq, like, or } from "drizzle-orm";
import { getDb } from "../db";
import { articles } from "../db/schema";
import type { ArticlePreview } from "./content";
import { resolveArticleImage } from "./article-image";

export type NewsArticle = typeof articles.$inferSelect;

// Shared DB-row -> homepage/list-card shape mapping, previously
// duplicated inline across app/page.tsx, category pages, etc.
export function toPreview(a: NewsArticle): ArticlePreview {
  return {
    slug: a.slug,
    category: a.category,
    title: a.title,
    excerpt: a.excerpt,
    author: "AIFootball խմբագրություն",
    time: new Date(a.publishedAt + "Z").toLocaleString("hy-AM", { timeZone: "Asia/Yerevan", hour: "2-digit", minute: "2-digit", hour12: false }),
    readTime: "3 րոպե",
    image: a.imageUrl || resolveArticleImage(a.category, a.slug),
    local: a.category.includes("Հայաստան"),
    featured: false,
  };
}

export async function getPublishedArticles(limit = 20, offset = 0): Promise<NewsArticle[]> {
  try {
    return await (await getDb())
      .select()
      .from(articles)
      .where(eq(articles.status, "published"))
      .orderBy(desc(articles.importance), desc(articles.publishedAt))
      .limit(limit)
      .offset(offset);
  } catch {
    return [];
  }
}

export async function getArticlesByCategory(category: string, limit = 20): Promise<NewsArticle[]> {
  try {
    return await (await getDb())
      .select()
      .from(articles)
      .where(and(eq(articles.status, "published"), eq(articles.category, category)))
      .orderBy(desc(articles.publishedAt))
      .limit(limit);
  } catch {
    return [];
  }
}

// No explicit "is this Armenian content" column exists, so this detects
// it by matching known Armenian club/national-team names in the title -
// covers recap/preview articles from the Armenian Premier League/Cup and
// any RSS/entity-sourced coverage that mentions them.
const ARMENIAN_KEYWORDS = ["Փյունիկ", "Նոահ", "Արարատ", "Ուրարտու", "Ալաշկերտ", "Շիրակ", "Վան", "ԲԿՄԱ", "Գանձասար", "Սյունիք", "Սարդարապատ", "Հայաստանի հավաքական", "Մխիթարյան", "Սպերծյան"];

export async function getArmenianArticles(limit = 20): Promise<NewsArticle[]> {
  try {
    const db = await getDb();
    const conditions = ARMENIAN_KEYWORDS.map((kw) => like(articles.title, `%${kw}%`));
    return await db
      .select()
      .from(articles)
      .where(and(eq(articles.status, "published"), or(...conditions)))
      .orderBy(desc(articles.publishedAt))
      .limit(limit);
  } catch {
    return [];
  }
}

export async function searchArticles(query: string, category: string, limit = 20): Promise<NewsArticle[]> {
  try {
    const db = await getDb();
    const conditions = [eq(articles.status, "published")];
    if (query.trim()) {
      const term = `%${query.trim()}%`;
      conditions.push(or(like(articles.title, term), like(articles.excerpt, term))!);
    }
    if (category) conditions.push(eq(articles.category, category));
    return await db
      .select()
      .from(articles)
      .where(and(...conditions))
      .orderBy(desc(articles.publishedAt))
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
  "ի":"i","լ":"l","խ":"kh","ծ":"ts","կ":"k","հ":"h","ձ":"dz","ղ":"gh",
  "մ":"m","յ":"y","ն":"n","շ":"sh","ո":"o","չ":"ch","պ":"p","ջ":"j","ռ":"r",
  "ս":"s","վ":"v","տ":"t","ր":"r","ց":"ts","ու":"u","փ":"p","ք":"q","օ":"o","ֆ":"f",
  "և":"ev",
};

function transliterateHy(text: string): string {
  // Bug found: the HY_TO_LATIN map only covers lowercase Armenian letters.
  // Titles always start with an uppercase Armenian letter (different
  // Unicode codepoints, Ա-Ֆ vs ա-ֆ), which silently failed to
  // transliterate and then got stripped by slugify's cleanup regex -
  // e.g. "Ֆուքեթում" became "uqetum" instead of "fuqetum", losing the
  // first letter of nearly every article's slug. Lowercasing first
  // (JS's toLowerCase correctly handles Armenian case folding) fixes
  // this for the whole alphabet at once.
  return text
    .toLowerCase()
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
