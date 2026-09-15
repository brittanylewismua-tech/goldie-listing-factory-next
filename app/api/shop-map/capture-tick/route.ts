import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { adoptPublishedWithoutCapture, runCaptureQueue } from "@/app/artwork-capture-queue";

/**
 * Work the artwork capture queue for one firing.
 *
 * Reached by the worker's own clock, which builds the request in memory so it
 * carries no cf-connecting-ip. An owner may also run a pass by hand.
 */
export const GET = withErrorLog("artwork-capture-tick", async (request: Request) => {
  if (request.headers.get("cf-connecting-ip") !== null) {
    const user = await getChatGPTUser();
    if (!user || !isOwner(user)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const asked = Number(new URL(request.url).searchParams.get("jobs"));
  const maxJobs = Number.isFinite(asked) && asked > 0 ? Math.min(asked, 60) : 12;
  /* Reconcile first: a publish whose enqueue failed is adopted before the
     queue is worked, so the gap closes on the same firing. */
  const adopted = await adoptPublishedWithoutCapture();
  return NextResponse.json({ adopted, ...(await runCaptureQueue({ maxJobs })) });
});
