import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { estimateBackfill } from "@/app/shop-baseline";

/**
 * WHAT THE BACKFILL WOULD COST, BEFORE IT RUNS.
 *
 * Sampled against real shops rather than assumed, so the decision to start it
 * is made against a measurement. Owner only; it spends a dozen calls.
 */
export const GET = withErrorLog("market-baseline-estimate", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  const asked = Number(new URL(request.url).searchParams.get("sample"));
  const sample = Number.isFinite(asked) && asked > 0 ? Math.min(asked, 30) : 12;
  return NextResponse.json(await estimateBackfill({ sample }));
});
