import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { inspectInterval, inspectionPass } from "@/app/triggered-inspection";

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
 * Work the inspection queue for one firing.
 *
 * Same authentication as the sensor: the clock builds this request in memory,
 * so it carries no cf-connecting-ip and no caller on the internet can forge
 * its absence. An owner may also run a pass by hand.
 */
export const POST = withErrorLog("market-inspect-tick", async (request: Request) => {
  if (request.headers.get("cf-connecting-ip") !== null) {
    const user = await getChatGPTUser();
    if (!user || !isOwner(user)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const parameters = new URL(request.url).searchParams;

  /* Re-run one interval by hand. Inspecting an interval twice is meant to be
     harmless, and this is how that is verified against production rather than
     asserted in a comment. */
  const one = Number(parameters.get("interval"));
  if (Number.isFinite(one) && one > 0)
    return NextResponse.json(await inspectInterval(one) ?? { error: "No such interval." });

  const asked = parameters.get("jobs") === null ? NaN : Number(parameters.get("jobs"));
  const maxJobs = Number.isFinite(asked) && asked > 0 ? Math.min(asked, 100) : 20;
  return NextResponse.json(await inspectionPass({ maxJobs }));
});
