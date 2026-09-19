import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { correlationPass } from "@/app/correlation-worker";

/**
 * ONE CORRELATION PASS.
 *
 * On the worker's own clock, and runnable by the owner. It spends no Etsy
 * budget at all, so unlike the inspector it can be run as often as there is
 * work — which is the whole point of replacing the API call with a join.
 */
export const maxDuration = 300;

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

export const POST = withErrorLog("market-correlate", async (request: Request) => {
  if (request.headers.get("cf-connecting-ip") !== null) {
    const user = await getChatGPTUser();
    if (!user || !isOwner(user))
      return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const requested = Number(new URL(request.url).searchParams.get("max"));
  const maxIntervals = Number.isFinite(requested) && requested > 0
    ? Math.min(requested, 2_000) : 400;
  try {
    return NextResponse.json(await correlationPass({ maxIntervals }));
  } catch (error) {
    /*
      The real message, to the owner, rather than "something went wrong".
      A generic wrapper on an internal route turns a five-minute fix into an
      afternoon of guessing, and this route has no member audience.
    */
    return NextResponse.json({
      error: error instanceof Error ? error.message : "correlation failed",
      stack: error instanceof Error ? String(error.stack ?? "").slice(0, 600) : "",
    }, { status: 500 });
  }
});
