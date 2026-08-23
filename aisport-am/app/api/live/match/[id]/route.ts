import { getLiveMatchDetailsV2, lastDebugReason } from "../../../../../lib/live-match-details-v2";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const details = await getLiveMatchDetailsV2(id);
    if (!details) return Response.json({ error: "not_found", debug: lastDebugReason }, { status: 404 });
    return Response.json(details);
  } catch (err) {
    return Response.json({ error: "exception", message: String(err), stack: err instanceof Error ? err.stack : null }, { status: 500 });
  }
}
