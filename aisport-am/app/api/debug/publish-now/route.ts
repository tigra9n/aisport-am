import { generateFromSourceSnippet } from "../../../../lib/content-generation";
import { saveGeneratedArticle } from "../../../../lib/articles";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token || token !== runtime.MODERATION_TOKEN) {
    return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const apiKey = runtime.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ ok: false, reason: "no ANTHROPIC_API_KEY" });

  let body: { title?: string; content?: string; sourceUrl?: string; sourceName?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }
  const title = body.title ?? "";
  const content = body.content ?? "";
  if (!title || !content) return Response.json({ ok: false, reason: "missing title/content" });

  const result = await generateFromSourceSnippet(apiKey, {
    title,
    snippet: content,
    sourceName: body.sourceName ?? "Goal.com",
  });
  if (!result) return Response.json({ ok: false, reason: "generation_failed" });

  const saved = await saveGeneratedArticle({
    ...result,
    sourceName: body.sourceName ?? "Goal.com",
    sourceUrl: body.sourceUrl ?? `https://www.goal.com/manual-${Date.now()}`,
    uniquePart: String(Date.now()),
  });

  return Response.json({ ok: true, saved, result });
}
