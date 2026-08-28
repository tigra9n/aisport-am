export const dynamic = "force-dynamic";

// This endpoint exists specifically to work around cron-job.org's hard
// 30s timeout: it does NOT run content generation itself (that routinely
// takes 60-90s with Sonnet 5). Instead it just triggers GitHub Actions
// workflows via the GitHub API and returns immediately - a sub-second
// call, comfortably inside cron-job.org's window. GitHub Actions then
// does the actual work with its own self-controlled, much longer
// timeout, unaffected by cron-job.org's constraint.
//
// Also dispatches warm-cache.yml alongside the content-generation
// workflow. warm-cache.yml was relying purely on GitHub Actions' native
// `schedule:` trigger, which suffers the exact same unreliable-scheduling
// problem this dispatch endpoint was built to work around for content
// generation (observed 3-12 hour gaps between runs instead of every 5
// minutes on this low-activity repo) - meaning the match-detail cache was
// almost never actually getting pre-warmed, so popups kept hitting slow
// cold-cache loads. Reusing this same already-reliable cron-job.org
// trigger for both workflows fixes that without needing a second external
// cron job.
//
// The GitHub PAT is kept as a Cloudflare secret and never exposed to
// cron-job.org - it only ever sees our own CRONJOB_TOKEN, same as the
// direct content endpoint.
async function dispatchWorkflow(workflowId: number, ghToken: string): Promise<{ workflowId: number; ok: boolean; status: number }> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/tigra9n/aisport-am/actions/workflows/${workflowId}/dispatches`,
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
    return { workflowId, ok: res.status === 204, status: res.status };
  } catch {
    return { workflowId, ok: false, status: 0 };
  }
}

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

  const BACKUP_CRON_WORKFLOW_ID = 341895529;
  const WARM_CACHE_WORKFLOW_ID = 340705721;
  const results = await Promise.all([
    dispatchWorkflow(BACKUP_CRON_WORKFLOW_ID, ghToken),
    dispatchWorkflow(WARM_CACHE_WORKFLOW_ID, ghToken),
  ]);
  return Response.json({ ok: results.every((r) => r.ok), results });
}
