import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { measureBatchLimit } from "@/app/listing-poller";

/**
 * How many listing ids Etsy really accepts, and what a full batch costs.
 *
 * The entire cost model rests on this number, and documented is not measured.
 * It also asks for one over the limit, because a silently truncated answer
 * would look like success while halving the corpus.
 */
export const GET = withErrorLog("market-batch-limit", async () => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  return NextResponse.json(await measureBatchLimit());
});
