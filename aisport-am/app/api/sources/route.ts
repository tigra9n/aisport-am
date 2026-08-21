import { getDb } from "../../../db";
import { sources } from "../../../db/schema";

async function authorized(request: Request) {
  const { env } = await import("cloudflare:workers");
  const runtimeEnv = env as unknown as Record<string, string | undefined>;
  return Boolean(runtimeEnv.AUTOMATION_SECRET) && request.headers.get("x-automation-secret") === runtimeEnv.AUTOMATION_SECRET;
}

export async function POST(request: Request) {
  if (!await authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await request.json() as { name?: string; feedUrl?: string; language?: string };
  if (!payload.name?.trim() || !payload.feedUrl?.trim()) {
    return Response.json({ error: "name and feedUrl are required" }, { status: 400 });
  }
  try {
    new URL(payload.feedUrl);
  } catch {
    return Response.json({ error: "feedUrl must be a valid URL" }, { status: 400 });
  }
  const [source] = await (await getDb()).insert(sources).values({
    name: payload.name.trim(),
    feedUrl: payload.feedUrl.trim(),
    language: payload.language?.trim() || "en",
  }).returning();
  return Response.json({ source }, { status: 201 });
}
