import { getPublishedArticles } from "../../../lib/articles";

export async function GET() {
  return Response.json({ articles: await getPublishedArticles(30) });
}
