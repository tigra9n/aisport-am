import { createOpinion, deleteOpinion, updateOpinion } from "../../../lib/opinions";

export const dynamic = "force-dynamic";

function checkToken(request: Request, runtime: Record<string, string | undefined>): boolean {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  return Boolean(token) && token === runtime.MODERATION_TOKEN;
}

export async function POST(request: Request) {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;
  if (!checkToken(request, runtime)) {
    return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  let body: { author?: string; role?: string; title?: string; content?: string; category?: string; imageUrl?: string; videoUrl?: string };
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
    category: body.category,
    imageUrl: body.imageUrl,
    videoUrl: body.videoUrl,
  });

  if (!result.ok) return Response.json(result, { status: 400 });
  return Response.json(result);
}

export async function PUT(request: Request) {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;
  if (!checkToken(request, runtime)) {
    return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const id = Number.parseInt(url.searchParams.get("id") ?? "", 10);
  if (!Number.isFinite(id)) return Response.json({ ok: false, reason: "invalid_id" }, { status: 400 });

  let body: { author?: string; role?: string; title?: string; content?: string; category?: string; imageUrl?: string; videoUrl?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }

  const result = await updateOpinion(id, {
    author: body.author ?? "",
    role: body.role ?? "",
    title: body.title ?? "",
    content: body.content ?? "",
    category: body.category,
    imageUrl: body.imageUrl,
    videoUrl: body.videoUrl,
  });

  if (!result.ok) return Response.json(result, { status: 400 });
  return Response.json(result);
}

export async function DELETE(request: Request) {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;
  if (!checkToken(request, runtime)) {
    return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const id = Number.parseInt(url.searchParams.get("id") ?? "", 10);
  if (!Number.isFinite(id)) return Response.json({ ok: false, reason: "invalid_id" }, { status: 400 });

  const result = await deleteOpinion(id);
  if (!result.ok) return Response.json(result, { status: 400 });
  return Response.json(result);
}
