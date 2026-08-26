import { getDb } from "../../../../db";
import { comments } from "../../../../db/schema";
import { desc, eq } from "drizzle-orm";

async function checkAuth(token: string | null): Promise<boolean> {
  if (!token) return false;
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;
  return Boolean(runtime.CRON_TOKEN) && token === runtime.CRON_TOKEN;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!(await checkAuth(url.searchParams.get("token")))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  const rows = await db
    .select()
    .from(comments)
    .where(eq(comments.status, "pending"))
    .orderBy(desc(comments.id))
    .limit(100);
  return Response.json({ comments: rows });
}

export async function POST(request: Request) {
  const body = await request.json() as { token?: string; id?: number; action?: "approve" | "reject" };
  if (!(await checkAuth(body.token ?? null))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!body.id || !body.action || !["approve", "reject"].includes(body.action)) {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }
  const db = await getDb();
  const status = body.action === "approve" ? "approved" : "rejected";
  await db.update(comments).set({ status }).where(eq(comments.id, body.id));
  return Response.json({ ok: true });
}
