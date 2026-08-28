// Real, D1-backed opinion pieces, replacing the old hardcoded fake-author
// placeholder array in lib/content.ts. No formal drizzle migration for
// this yet - the table is created lazily on first use (same lightweight
// pattern as api_cache elsewhere in this codebase), so no separate
// deploy-time migration step is needed.

import { transliterateHy } from "./articles";

export type Opinion = {
  id: number;
  slug: string;
  author: string;
  role: string;
  title: string;
  content: string;
  initials: string;
  publishedAt: string;
  category: string;
  imageUrl: string | null;
  videoUrl: string | null;
};

export const OPINION_CATEGORIES = ["Հայկական սպորտ", "Հայկական ֆուտբոլ"] as const;

let tableReady: Promise<unknown> | null = null;

async function getDB(): Promise<D1Database | null> {
  const { env } = await import("cloudflare:workers");
  return (env as unknown as { DB?: D1Database }).DB ?? null;
}

async function ensureTable(db: D1Database) {
  tableReady ??= (async () => {
    await db.prepare(`CREATE TABLE IF NOT EXISTS opinions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      author TEXT NOT NULL,
      role TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      initials TEXT NOT NULL,
      published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'published',
      category TEXT NOT NULL DEFAULT 'Հայկական սպորտ',
      image_url TEXT,
      video_url TEXT
    )`).run();
    // Table may already exist from before these columns were added -
    // ALTER TABLE ADD COLUMN is safe to retry (ignored if already present).
    for (const stmt of [
      "ALTER TABLE opinions ADD COLUMN category TEXT NOT NULL DEFAULT 'Հայկական սպորտ'",
      "ALTER TABLE opinions ADD COLUMN image_url TEXT",
      "ALTER TABLE opinions ADD COLUMN video_url TEXT",
    ]) {
      try { await db.prepare(stmt).run(); } catch { /* column already exists */ }
    }
  })();
  await tableReady;
}

function slugify(title: string): string {
  // Bug found: the previous version used \p{L} (matches letters in ANY
  // script, including Armenian) instead of transliterating - Armenian
  // opinion titles ended up with raw Armenian Unicode characters in the
  // URL (e.g. "/opinions/արարատ-արմենիան-...") instead of proper Latin
  // slugs like the auto-generated news articles already have. Reuse the
  // same transliteration used there for consistency.
  const base = transliterateHy(title)
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join("-")
    .slice(0, 60);
  return `${base || "notice"}-${Date.now().toString(36)}`;
}

function initialsOf(author: string): string {
  const parts = author.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "ԱՍ";
}

export async function getOpinions(limit = 20, category?: string): Promise<Opinion[]> {
  try {
    const db = await getDB();
    if (!db) return [];
    await ensureTable(db);
    const query = category
      ? "SELECT id, slug, author, role, title, content, initials, published_at AS publishedAt, category, image_url AS imageUrl, video_url AS videoUrl FROM opinions WHERE status = 'published' AND category = ? ORDER BY id DESC LIMIT ?"
      : "SELECT id, slug, author, role, title, content, initials, published_at AS publishedAt, category, image_url AS imageUrl, video_url AS videoUrl FROM opinions WHERE status = 'published' ORDER BY id DESC LIMIT ?";
    const stmt = category ? db.prepare(query).bind(category, limit) : db.prepare(query).bind(limit);
    const { results } = await stmt.all<Opinion>();
    return results ?? [];
  } catch {
    return [];
  }
}

export async function getOpinionBySlug(slug: string): Promise<Opinion | null> {
  try {
    const db = await getDB();
    if (!db) return null;
    await ensureTable(db);
    const row = await db
      .prepare("SELECT id, slug, author, role, title, content, initials, published_at AS publishedAt, category, image_url AS imageUrl, video_url AS videoUrl FROM opinions WHERE slug = ? AND status = 'published'")
      .bind(slug)
      .first<Opinion>();
    return row ?? null;
  } catch {
    return null;
  }
}

export async function getOpinionById(id: number): Promise<Opinion | null> {
  try {
    const db = await getDB();
    if (!db) return null;
    await ensureTable(db);
    const row = await db
      .prepare("SELECT id, slug, author, role, title, content, initials, published_at AS publishedAt, category, image_url AS imageUrl, video_url AS videoUrl FROM opinions WHERE id = ?")
      .bind(id)
      .first<Opinion>();
    return row ?? null;
  } catch {
    return null;
  }
}

export async function updateOpinion(id: number, input: { author: string; role: string; title: string; content: string; category?: string; imageUrl?: string; videoUrl?: string }): Promise<{ ok: boolean; reason?: string }> {
  const author = input.author.trim();
  const role = input.role.trim();
  const title = input.title.trim();
  const content = input.content.trim();
  if (!author || !role || !title || !content) return { ok: false, reason: "missing_fields" };
  const category = OPINION_CATEGORIES.includes(input.category as typeof OPINION_CATEGORIES[number])
    ? (input.category as string)
    : OPINION_CATEGORIES[0];
  const imageUrl = input.imageUrl?.trim() || null;
  const videoUrl = input.videoUrl?.trim() || null;

  try {
    const db = await getDB();
    if (!db) return { ok: false, reason: "no_db" };
    await ensureTable(db);
    await db
      .prepare("UPDATE opinions SET author = ?, role = ?, title = ?, content = ?, initials = ?, category = ?, image_url = ?, video_url = ? WHERE id = ?")
      .bind(author, role, title, content, initialsOf(author), category, imageUrl, videoUrl, id)
      .run();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

export async function deleteOpinion(id: number): Promise<{ ok: boolean; reason?: string }> {
  try {
    const db = await getDB();
    if (!db) return { ok: false, reason: "no_db" };
    await ensureTable(db);
    await db.prepare("DELETE FROM opinions WHERE id = ?").bind(id).run();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

export async function createOpinion(input: { author: string; role: string; title: string; content: string; category?: string; imageUrl?: string; videoUrl?: string }): Promise<{ ok: boolean; slug?: string; reason?: string }> {
  const author = input.author.trim();
  const role = input.role.trim();
  const title = input.title.trim();
  const content = input.content.trim();
  if (!author || !role || !title || !content) return { ok: false, reason: "missing_fields" };
  const category = OPINION_CATEGORIES.includes(input.category as typeof OPINION_CATEGORIES[number])
    ? (input.category as string)
    : OPINION_CATEGORIES[0];
  const imageUrl = input.imageUrl?.trim() || null;
  const videoUrl = input.videoUrl?.trim() || null;

  try {
    const db = await getDB();
    if (!db) return { ok: false, reason: "no_db" };
    await ensureTable(db);
    const slug = slugify(title);
    await db
      .prepare("INSERT INTO opinions (slug, author, role, title, content, initials, category, image_url, video_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(slug, author, role, title, content, initialsOf(author), category, imageUrl, videoUrl)
      .run();
    return { ok: true, slug };
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}
