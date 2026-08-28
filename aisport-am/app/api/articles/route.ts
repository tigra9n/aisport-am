import { getPublishedArticles, toPreview } from "../../../lib/articles";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const limit = Math.min(30, Math.max(1, Number(url.searchParams.get("limit")) || 30));
  const rows = await getPublishedArticles(limit, offset);
  return Response.json({ articles: rows, previews: rows.map(toPreview) }, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
  });
}
