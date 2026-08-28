import { createOpinion } from "../../../lib/opinions";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token || !runtime.MODERATION_TOKEN || token !== runtime.MODERATION_TOKEN) {
    return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  let body: { author?: string; role?: string; title?: string; content?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }

  const result = await createOpinion({
    author: body.author ?? "",
    role: body.role ?? "",
    title: body.title ?? "",
    content: body.content ?? "",
  });

  if (!result.ok) return Response.json(result, { status: 400 });
  return Response.json(result);
}
