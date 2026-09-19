import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { runSweep } from "@/app/sold-overnight";

/*
  D1716 · A JOB IS NOT A GET.

  This ran work on a GET. The internal-only header check is what keeps the
  outside world out, and it held — but a GET is meant to be safe to repeat
  and safe to follow, and any prefetch, crawl or copied link that ever got
  past that check would have started the job. It answers on POST now, and
  the GET refuses without running anything.
*/
export async function GET() {
  return NextResponse.json(
    { error: "This runs a job, so it is a POST now. Nothing was run." },
    { status: 405, headers: { Allow: "POST" } });
}

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
export const POST = withErrorLog("sold-overnight-cron", async (request: Request) => {
  if (request.headers.get("cf-connecting-ip") !== null)
    return NextResponse.json({ error: "Not found." }, { status: 404 });

  /* Bounded per firing. The schedule is what makes the corpus current, not
     the size of any single run. */
  const result = await runSweep({ maxCalls: 60, discovery: true, pages: 1 });
  return NextResponse.json(result);
});
