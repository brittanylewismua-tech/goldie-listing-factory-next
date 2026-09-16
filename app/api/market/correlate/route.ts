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

export const GET = withErrorLog("market-correlate", async (request: Request) => {
  if (request.headers.get("cf-connecting-ip") !== null) {
    const user = await getChatGPTUser();
    if (!user || !isOwner(user))
      return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const requested = Number(new URL(request.url).searchParams.get("max"));
  const maxIntervals = Number.isFinite(requested) && requested > 0
    ? Math.min(requested, 2_000) : 400;
  return NextResponse.json(await correlationPass({ maxIntervals }));
});
