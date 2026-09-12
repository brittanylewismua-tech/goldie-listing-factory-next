/**
 * THE WORKER'S FRONT DOOR, WITH A CLOCK ATTACHED.
 *
 * vinext builds a worker that exports an empty `scheduled` handler — Cloudflare
 * will fire a cron at it and nothing will happen. Rather than patch generated
 * output, this wraps it: the framework keeps serving every request exactly as
 * before, and the schedule gets a real implementation.
 *
 * The sweep is invoked by handing the framework a Request built here in memory.
 * It never crosses the network, so Cloudflare never stamps `cf-connecting-ip`
 * on it, and the cron route treats the absence of that header as proof the
 * call came from inside the worker. No shared secret to leak or rotate.
 *
 * waitUntil, not await: a cron firing should not be held open by however long
 * a slice of Etsy reads takes.
 */
import app, { DraftCreationWorkflow, PhotoDeliveryWorkflow } from "./dist/server/index.js";

export { DraftCreationWorkflow, PhotoDeliveryWorkflow };

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),

  async scheduled(event, env, ctx) {
    const site = (env.GOLDIE_SITE_URL || "https://thegoldiesuite.com").replace(/\/$/, "");
    ctx.waitUntil(
      app.fetch(new Request(`${site}/api/sold-overnight/cron`), env, ctx)
        .catch(() => { /* the next firing tries again; a cron must not throw */ }),
    );
  },
};
