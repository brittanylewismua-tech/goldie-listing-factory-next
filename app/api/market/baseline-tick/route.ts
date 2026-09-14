import { NextResponse } from "next/server";
import { withErrorLog } from "@/app/error-log";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { backfillPass } from "@/app/shop-baseline";

/**
 * Enumerate shops, a slice per firing.
 *
 * The backfill is the lowest-priority Etsy workload in the system: it stops
 * when the day's reserve is gone rather than competing with the sensor, the
 * inspector, or a member publishing a batch.
 */
export const GET = withErrorLog("market-baseline-tick", async (request: Request) => {
  if (request.headers.get("cf-connecting-ip") !== null) {
    const user = await getChatGPTUser();
    if (!user || !isOwner(user)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const asked = Number(new URL(request.url).searchParams.get("calls"));
  const maxCalls = Number.isFinite(asked) && asked > 0 ? Math.min(asked, 300) : 60;
  return NextResponse.json(await backfillPass({ maxCalls }));
});
