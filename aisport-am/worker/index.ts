/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  CRON_TOKEN?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },

  // Native Cloudflare Cron Trigger handles the fast cache-warm task
  // reliably. Content generation (/api/cron/content) moved to a separate
  // GitHub Actions schedule instead: Cloudflare's own Cron Trigger
  // invocations have a tight execution-time ceiling (around 30s for
  // schedules more frequent than hourly), and real article generation
  // now regularly takes 40-85s - the scheduled invocation (and its
  // self-fetch) was getting killed before generation could finish,
  // silently losing ticks with no error logged anywhere. An externally
  // initiated request isn't bound by that same ceiling.
  async scheduled(_event: unknown, env: Env, ctx: ExecutionContext): Promise<void> {
    if (!env.CRON_TOKEN) return;
    const token = encodeURIComponent(env.CRON_TOKEN);
    ctx.waitUntil(fetch(`https://aisport.am/api/cron/warm?token=${token}`).catch(() => {}));
  },
};

export default worker;
