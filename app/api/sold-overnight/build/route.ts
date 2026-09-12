import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { withErrorLog } from "@/app/error-log";
import { buildNight, resetTonight } from "@/app/sold-overnight";

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
  /*
    SMALL AND RESUMABLE, because a worker gets killed long before a hundred
    thousand listings have been read. Each run does a bounded slice and
    returns; running it again continues where it stopped. The first attempt at
    this did discovery plus a hundred and twenty reads in one request, was cut
    off partway, and left a claim standing over an empty corpus.
  */
  /*
    `|| default` CANNOT BE USED ON A NUMBER THAT IS ALLOWED TO BE ZERO.

    pages=0 means "skip discovery, just read what we already watch", and
    `Number("0") || 1` is 1 — so the first version of this ran discovery every
    time it was told not to, silently, and reported 1,600 listings found on a
    request that asked for none. Parse, then fall back only when absent.
  */
  const asNumber = (name: string, fallback: number) => {
    const raw = url.searchParams.get(name);
    if (raw === null || raw.trim() === "") return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  };

  const maxCalls = Math.max(1, Math.min(400, asNumber("calls", 40)));
  const pages = Math.max(0, Math.min(20, asNumber("pages", 1)));
  const discovery = url.searchParams.get("discover") !== "0" && pages > 0;

  /*
    READ THE SHELF AGAIN WITHIN THE SAME NIGHT.

    The sweep normally skips anything already read tonight, which is what keeps
    the nightly bill flat. `again=1` clears that so a second pass can run — and
    the second pass is not a duplicate: it subtracts from the reading the first
    pass stored, so the night's total accumulates rather than resetting. More
    frequent sampling makes the count more accurate, not less.
  */
  const again = url.searchParams.get("again") === "1";
  if (again) await resetTonight();

  const result = await buildNight({ maxCalls, discovery, pages });
  return NextResponse.json(result);
});

/** Same thing on a GET, so it can be run from the address bar. */
export const GET = POST;
