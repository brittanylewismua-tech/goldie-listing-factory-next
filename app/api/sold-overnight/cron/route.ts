import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { runSweep } from "@/app/sold-overnight";

/**
 * THE SCHEDULED SWEEP.
 *
 * Reached only by the worker's own cron handler, which builds a Request in
 * memory and hands it straight to the fetch handler without it ever crossing
 * the network.
 *
 * THAT IS ALSO HOW IT IS AUTHENTICATED, and it is worth being explicit about
 * why this is not a shared-secret endpoint. Cloudflare sets `cf-connecting-ip`
 * on every request that actually arrives from the internet, and cannot be
 * persuaded not to. A Request constructed inside the worker has no such
 * header. So the absence of it is proof of origin that a caller outside cannot
 * forge — no token to leak, nothing to rotate, and nothing an attacker could
 * use to burn the Etsy allowance.
 */
export const GET = withErrorLog("sold-overnight-cron", async (request: Request) => {
  if (request.headers.get("cf-connecting-ip") !== null)
    return NextResponse.json({ error: "Not found." }, { status: 404 });

  /* Bounded per firing. The schedule is what makes the corpus current, not
     the size of any single run. */
  const result = await runSweep({ maxCalls: 60, discovery: true, pages: 1 });
  return NextResponse.json(result);
});
