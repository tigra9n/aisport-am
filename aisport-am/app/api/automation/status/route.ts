import { desc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { automationRuns, sources } from "../../../../db/schema";
import { configuredPlatforms } from "../../../../lib/automation";

// Was completely unauthenticated and leaking the real APITube API key in
// plaintext (embedded in sources.feedUrl) to anyone who found this URL -
// found during a security QA pass. Now requires the same token used for
// comment moderation.
async function checkAuth(token: string | null): Promise<boolean> {
  if (!token) return false;
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;
  return Boolean(runtime.MODERATION_TOKEN) && token === runtime.MODERATION_TOKEN;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!(await checkAuth(url.searchParams.get("token")))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const db = await getDb();
    const [lastRun] = await db.select().from(automationRuns).orderBy(desc(automationRuns.startedAt)).limit(1);
    const sourceRows = await db.select().from(sources);
    return Response.json({ configured: await configuredPlatforms(), lastRun: lastRun ?? null, sources: sourceRows });
  } catch {
    return Response.json({ configured: await configuredPlatforms(), lastRun: null, sources: [] });
  }
}
