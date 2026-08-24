import { getPublishedArticles } from "../../../lib/articles";

export const dynamic = "force-dynamic";

export async function GET() {
  const articles = await getPublishedArticles(30);
  return Response.json({ articles }, {
    headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
  });
}
