/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { callerIdentity, consume, LIMITS, tooManyRequests } from "../app/request-limits";
import { isInternalCall, surfaceFor } from "../app/request-surfaces";
export {PhotoDeliveryWorkflow} from "./photo-delivery-workflow";
export {DraftCreationWorkflow} from "./draft-creation-workflow";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
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

    /* D931 · Etsy publishing is seller-controlled in Printify. Never kick the retired Goldie queue. */

    /*
      BOUND EVERY API CALL, IN ONE PLACE.

      Route-by-route limiting would mean 144 separate decisions, and a route
      that got missed would look exactly like one that was considered. The
      classifier has a catch-all instead, so a route added tomorrow is bounded
      the day it exists rather than the day somebody remembers it.

      Scheduled self-calls are skipped because they have no caller to bound.
      They are recognised by the absence of a client address — which a real
      caller cannot produce — rather than by a path a caller could request.
    */
    if (url.pathname.startsWith("/api/") && !isInternalCall(request, url.pathname)) {
      const surface = surfaceFor(request.method, url.pathname);
      const outcome = await consume(
        env.DB, surface, await callerIdentity(request), LIMITS[surface]);
      if (!outcome.allowed)
        return tooManyRequests(
          "That is more requests than this account can make right now. Try again shortly.",
          outcome);
    }

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
  async scheduled(_controller: ScheduledController, _env: Env, _ctx: ExecutionContext): Promise<void> {
    /* Intentionally empty: Goldie no longer publishes listings to Etsy. */
  },
};

export default worker;
