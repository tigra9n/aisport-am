export const dynamic = "force-dynamic";

// Temporary debug tool: makes a raw APITube call using the Worker's own
// stored APITUBE_KEY secret and returns the rate-limit response headers
// (without exposing the key itself), to diagnose the 59% error rate seen
// on APITube's dashboard.
export async function GET(request: Request) {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token || token !== runtime.MODERATION_TOKEN) {
    return Response.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const apiKey = runtime.APITUBE_KEY;
  if (!apiKey) return Response.json({ ok: false, reason: "no APITUBE_KEY" });

  const res = await fetch(`https://api.apitube.io/v1/news/everything?api_key=${encodeURIComponent(apiKey)}&language.code=en&per_page=3`);
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    if (key.toLowerCase().includes("ratelimit") || key.toLowerCase().includes("retry")) headers[key] = value;
  });

  return Response.json({ status: res.status, headers, keyLength: apiKey.length, keyPrefix: apiKey.slice(0, 8) });
}
