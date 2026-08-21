import { getDb } from "../../../db";
import { comments } from "../../../db/schema";

function clean(value: unknown, limit: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { articleSlug?: unknown; author?: unknown; body?: unknown; website?: unknown };
    if (clean(payload.website, 80)) return Response.json({ ok: true });

    const articleSlug = clean(payload.articleSlug, 160);
    const author = clean(payload.author, 60);
    const body = clean(payload.body, 800);
    if (!articleSlug || author.length < 2 || body.length < 3) {
      return Response.json({ error: "Լրացրեք անունն ու մեկնաբանությունը։" }, { status: 400 });
    }

    await (await getDb()).insert(comments).values({ articleSlug, author, body, status: "pending" });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Մեկնաբանությունը չհաջողվեց ուղարկել։" }, { status: 500 });
  }
}
