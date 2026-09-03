import { and, desc, eq, gt, like, or } from "drizzle-orm";
import { getDb } from "../db";
import { articles } from "../db/schema";
import type { ArticlePreview } from "./content";
import { resolveArticleImage } from "./article-image";
import { detectLeague } from "./league-tags";
import { isSameStory } from "./story-signature";
import { readTimeLabel } from "./reading-time";

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
    readTime: readTimeLabel(a.content),
    image: a.imageUrl || resolveArticleImage(a.category, a.slug),
    local: a.category.includes("Հայաստան"),
    featured: false,
    basePath: "/news",
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

export async function getArticlesByLeague(league: string, limit = 30): Promise<NewsArticle[]> {
  try {
    return await (await getDb())
      .select()
      .from(articles)
      .where(and(eq(articles.status, "published"), eq(articles.league, league)))
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
      // The body and the tags count too. Searching only the headline and
      // the summary meant "Մխիթարյան" returned nothing while articles that
      // discuss him at length sat in the archive - the site's own search
      // could not find its own coverage.
      conditions.push(or(
        like(articles.title, term),
        like(articles.excerpt, term),
        like(articles.content, term),
        like(articles.tags, term),
      )!);
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
    // Only published ones. Every list on the site filters by status, but
    // this did not, so an article withdrawn for a factual error or as a
    // duplicate stayed reachable at its own address - removed from the
    // listings and still readable by anyone holding the link.
    const [article] = await (await getDb())
      .select()
      .from(articles)
      .where(and(eq(articles.slug, slug), eq(articles.status, "published")))
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

// Two letters were missing from this map: ճ and ւ. A letter that is absent
// falls through the ?? ch fallback unchanged and is then deleted outright by
// slugify's [^a-z0-9\s-] cleanup, so it vanished from the URL rather than
// being transliterated - "մրցաշարային" lost a character instead of becoming
// "mrtsasharayin". ճ takes "ch" to match չ, which this map already spells
// that way; ւ is almost always part of the ու digraph handled before this
// map is consulted, so a standalone one is rare and takes "v".
const HY_TO_LATIN: Record<string, string> = {
  "ա":"a","բ":"b","գ":"g","դ":"d","ե":"e","զ":"z","է":"e","ը":"y","թ":"t","ժ":"zh",
  "ի":"i","լ":"l","խ":"kh","ծ":"ts","կ":"k","հ":"h","ձ":"dz","ղ":"gh",
  "ճ":"ch","մ":"m","յ":"y","ն":"n","շ":"sh","ո":"o","չ":"ch","պ":"p","ջ":"j","ռ":"r",
  "ս":"s","վ":"v","տ":"t","ր":"r","ց":"ts","ու":"u","ւ":"v","փ":"p","ք":"q","օ":"o","ֆ":"f",
  "և":"ev",
};

export function transliterateHy(text: string): string {
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

// Why the last save was refused, for the cron log - a story dropped as a
// repeat should be visible, not silent.
export let lastSaveSkipReason = "";

// The same story reaching us from two outlets has two source URLs, so the
// unique constraint below cannot see it: two pieces about Manu Koné went out
// ninety minutes apart, one from Foot Mercato and one from Metro. Compare
// what the new piece is about against everything published in the last day.
const SAME_STORY_WINDOW_HOURS = 24;

async function alreadyToldThisStory(title: string, excerpt: string): Promise<string | null> {
  try {
    const db = await getDb();
    const since = new Date(Date.now() - SAME_STORY_WINDOW_HOURS * 60 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);
    const recent = await db
      .select({ title: articles.title, excerpt: articles.excerpt })
      .from(articles)
      .where(and(eq(articles.status, "published"), gt(articles.publishedAt, since)))
      .orderBy(desc(articles.publishedAt))
      .limit(80);
    for (const published of recent) {
      if (isSameStory({ title, excerpt }, { title: published.title, excerpt: published.excerpt })) {
        return published.title;
      }
    }
    return null;
  } catch {
    // A failed lookup must not stop publishing - the worst case is the
    // behaviour we had before this check existed.
    return null;
  }
}

// Returns true if a new row was inserted, false if it already existed
// (sourceUrl is unique, so re-processing the same match/feed item is safe)
// or if the same story went out in the last day.
export async function saveGeneratedArticle(input: {
  title: string;
  excerpt: string;
  content: string;
  category: string;
  imageUrl?: string | null;
  sourceName: string;
  sourceUrl: string;
  uniquePart: string;
  seoTitle?: string | null;
  metaDescription?: string | null;
  tags?: string[];
  facebookText?: string | null;
  telegramText?: string | null;
  alternativeTitles?: string[];
  confidence?: number | null;
}): Promise<boolean> {
  try {
    lastSaveSkipReason = "";
    const duplicateOf = await alreadyToldThisStory(input.title, input.excerpt);
    if (duplicateOf) {
      lastSaveSkipReason = `same story as "${duplicateOf.slice(0, 60)}"`;
      return false;
    }

    const db = await getDb();
    const league = detectLeague(input.title, input.content, input.category);
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
        league,
        seoTitle: input.seoTitle ?? null,
        metaDescription: input.metaDescription ?? null,
        tags: input.tags?.length ? JSON.stringify(input.tags) : null,
        facebookText: input.facebookText ?? null,
        telegramText: input.telegramText ?? null,
        alternativeTitles: input.alternativeTitles?.length ? JSON.stringify(input.alternativeTitles) : null,
        confidence: input.confidence ?? null,
      })
      .onConflictDoNothing({ target: articles.sourceUrl })
      .returning({ id: articles.id });
    return result.length > 0;
  } catch (err) {
    console.error(`[articles] save failed: ${String(err)}`);
    return false;
  }
}
