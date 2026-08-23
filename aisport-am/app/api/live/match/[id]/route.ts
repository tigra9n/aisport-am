import { getLiveMatchDetailsV2 } from "../../../../../lib/live-match-details-v2";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const details = await getLiveMatchDetailsV2(id);
  if (!details) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(details);
}
