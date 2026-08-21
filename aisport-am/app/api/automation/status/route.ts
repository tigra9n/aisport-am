import { desc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { automationRuns, sources } from "../../../../db/schema";
import { configuredPlatforms } from "../../../../lib/automation";

export async function GET() {
  try {
    const db = await getDb();
    const [lastRun] = await db.select().from(automationRuns).orderBy(desc(automationRuns.startedAt)).limit(1);
    const sourceRows = await db.select().from(sources);
    return Response.json({ configured: await configuredPlatforms(), lastRun: lastRun ?? null, sources: sourceRows });
  } catch {
    return Response.json({ configured: await configuredPlatforms(), lastRun: null, sources: [] });
  }
}
