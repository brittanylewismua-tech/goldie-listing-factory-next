import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { sensorPass } from "@/app/shop-sensor";

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
 * ONE SENSOR PASS PER FIRING.
 *
 * Reached by the worker's own clock, which builds the request in memory so it
 * carries no cf-connecting-ip — proof of origin nobody outside can forge. An
 * owner may also run a pass by hand, which is what makes a stalled sensor
 * debuggable rather than mysterious.
 *
 * Bounded per firing. The schedule is what keeps the corpus current, never the
 * size of one run, and the bound is what stops a bad minute burning the
 * allowance.
 */
export const POST = withErrorLog("market-sensor-tick", async (request: Request) => {
  if (request.headers.get("cf-connecting-ip") !== null) {
    const user = await getChatGPTUser();
    if (!user || !isOwner(user)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const requested = Number(new URL(request.url).searchParams.get("calls"));
  /* Number("") is 0 and Number(null) is 0, and this codebase has already
     shipped a discovery run that silently did nothing because of it. */
  const maxCalls = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 80) : 20;

  return NextResponse.json(await sensorPass({ maxCalls }));
});
