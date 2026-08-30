import { generateFromSourceSnippet } from "../../../../lib/content-generation";

export const dynamic = "force-dynamic";

// Temporary debug tool: lets us regenerate the SAME facts from an
// existing article using whatever the CURRENT system prompt is, so we
// can directly compare "before" (already published, old prompt) vs
// "after" (fresh call, latest prompt) without waiting for new real-world
// source material to show up. Not linked from anywhere in the UI.
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

  let body: { title?: string; content?: string };
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
    sourceName: "AIFootball (previous generation, for prompt comparison)",
  });

  return Response.json({ ok: Boolean(result), result });
}
