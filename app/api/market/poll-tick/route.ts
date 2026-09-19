import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { pollSweep } from "@/app/listing-poller";

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
 * One slice of the corpus per firing.
 *
 * The clock builds this request in memory, so it carries no cf-connecting-ip
 * and no caller on the internet can forge its absence. An owner may also run a
 * sweep by hand, which is what makes a stalled poller debuggable.
 */
export const POST = withErrorLog("market-poll-tick", async (request: Request) => {
  if (request.headers.get("cf-connecting-ip") !== null) {
    const user = await getChatGPTUser();
    if (!user || !isOwner(user)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const asked = Number(new URL(request.url).searchParams.get("batches"));
  /* The whole corpus is 154 batches; the default covers it with room for the
     corpus to grow before anyone has to think about tiers. */
  const maxBatches = Number.isFinite(asked) && asked > 0 ? Math.min(asked, 200) : 160;
  return NextResponse.json(await pollSweep({ maxBatches }));
});
