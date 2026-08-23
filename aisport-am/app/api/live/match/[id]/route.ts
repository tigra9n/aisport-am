import { getLiveMatchDetailsV2 } from "../../../../../lib/live-match-details-v2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const details = await getLiveMatchDetailsV2(id);
  if (!details) return Response.json({ error: "not_found" }, { status: 404, headers: NO_CACHE_HEADERS });
  return Response.json(details, { headers: NO_CACHE_HEADERS });
}
