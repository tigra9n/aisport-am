import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { articles } from "../../../../db/schema";

export const dynamic = "force-dynamic";

// Temporary one-off debug tool: update a specific existing article's
// content/title/extended fields directly, used to apply a regenerated
// (new-prompt) version over an old one that Tigran picked out by hand.
export async function POST(request: Request) {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const id = Number.parseInt(url.searchParams.get("id") ?? "", 10);
  if (!token || token !== runtime.MODERATION_TOKEN) {
    return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }
  if (!Number.isFinite(id)) return Response.json({ ok: false, reason: "invalid_id" }, { status: 400 });

  let body: {
    title?: string; excerpt?: string; content?: string;
    seoTitle?: string; metaDescription?: string; tags?: string[];
    facebookText?: string; telegramText?: string; alternativeTitles?: string[];
    confidence?: number;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }

  const db = await getDb();
  await db.update(articles).set({
    title: body.title,
    excerpt: body.excerpt,
    content: body.content,
    seoTitle: body.seoTitle ?? null,
    metaDescription: body.metaDescription ?? null,
    tags: body.tags?.length ? JSON.stringify(body.tags) : null,
    facebookText: body.facebookText ?? null,
    telegramText: body.telegramText ?? null,
    alternativeTitles: body.alternativeTitles?.length ? JSON.stringify(body.alternativeTitles) : null,
    confidence: body.confidence ?? null,
  }).where(eq(articles.id, id));

  return Response.json({ ok: true });
}
