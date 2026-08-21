import { runAutomation } from "../../../../lib/automation";

export async function POST(request: Request) {
  const { env } = await import("cloudflare:workers");
  const runtimeEnv = env as unknown as Record<string, string | undefined>;
  const supplied = request.headers.get("x-automation-secret") || new URL(request.url).searchParams.get("key");
  if (!runtimeEnv.AUTOMATION_SECRET || supplied !== runtimeEnv.AUTOMATION_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runAutomation(new URL(request.url).origin);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Automation failed" },
      { status: 500 }
    );
  }
}
