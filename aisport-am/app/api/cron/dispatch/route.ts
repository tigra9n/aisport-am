export const dynamic = "force-dynamic";

// This endpoint exists specifically to work around cron-job.org's hard
// 30s timeout: it does NOT run content generation itself (that routinely
// takes 60-90s with Sonnet 5). Instead it just triggers the
// backup-cron.yml GitHub Actions workflow via the GitHub API and returns
// immediately - a sub-second call, comfortably inside cron-job.org's
// window. GitHub Actions then does the actual generation with its own
// self-controlled, much longer timeout (100s), unaffected by
// cron-job.org's constraint.
//
// The GitHub PAT is kept as a Cloudflare secret and never exposed to
// cron-job.org - it only ever sees our own CRONJOB_TOKEN, same as the
// direct content endpoint.
export async function GET(request: Request): Promise<Response> {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, string | undefined>;

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const validToken = Boolean(token) && (token === runtime.CRON_TOKEN || token === runtime.CRONJOB_TOKEN);
  if (!validToken) {
    return Response.json({ ok: false, reason: "invalid token" }, { status: 401 });
  }

  const ghToken = runtime.GH_DISPATCH_TOKEN;
  if (!ghToken) {
    return Response.json({ ok: false, reason: "no GH_DISPATCH_TOKEN configured" });
  }

  try {
    const res = await fetch(
      "https://api.github.com/repos/tigra9n/aisport-am/actions/workflows/341895529/dispatches",
      {
        method: "POST",
        headers: {
          Authorization: `token ${ghToken}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "aisport-am-dispatch",
        },
        body: JSON.stringify({ ref: "main" }),
      },
    );
    return Response.json({ ok: res.status === 204, status: res.status });
  } catch (err) {
    return Response.json({ ok: false, reason: String(err) });
  }
}
