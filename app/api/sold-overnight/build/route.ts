import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { withErrorLog } from "@/app/error-log";
import { buildNight } from "@/app/sold-overnight";

/**
 * RUN THE NIGHT'S READ PROPERLY.
 *
 * The board page nudges the sweep a few calls at a time, which is fine once
 * there are people arriving each morning but will not finish a large corpus on
 * its own. This is the full run: discovery, then read the whole shelf.
 *
 * Owner-only and repeatable — calling it twice on a finished night costs
 * nothing, because the night is already marked read. Intended to be driven on
 * a schedule; until then it is a button.
 */
export const POST = withErrorLog("sold-overnight-build", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const url = new URL(request.url);
  const maxCalls = Math.max(1, Math.min(2_000, Number(url.searchParams.get("calls")) || 400));
  const discovery = url.searchParams.get("discover") !== "0";

  const result = await buildNight({ maxCalls, discovery });
  return NextResponse.json(result);
});

/** Same thing on a GET, so it can be run from the address bar. */
export const GET = POST;
