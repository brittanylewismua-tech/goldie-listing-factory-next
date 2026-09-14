import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { pollSweep } from "@/app/listing-poller";

/**
 * One slice of the corpus per firing.
 *
 * The clock builds this request in memory, so it carries no cf-connecting-ip
 * and no caller on the internet can forge its absence. An owner may also run a
 * sweep by hand, which is what makes a stalled poller debuggable.
 */
export const GET = withErrorLog("market-poll-tick", async (request: Request) => {
  if (request.headers.get("cf-connecting-ip") !== null) {
    const user = await getChatGPTUser();
    if (!user || !isOwner(user)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const asked = Number(new URL(request.url).searchParams.get("batches"));
  const maxBatches = Number.isFinite(asked) && asked > 0 ? Math.min(asked, 200) : 40;
  return NextResponse.json(await pollSweep({ maxBatches }));
});
