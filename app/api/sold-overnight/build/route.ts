import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { withErrorLog } from "@/app/error-log";
import { refreshNow, runSweep } from "@/app/sold-overnight";

/**
 * RUN A SWEEP BY HAND.
 *
 * The cron keeps the corpus current on its own. This is the owner's override:
 * a bigger slice, discovery on demand, or a full re-read that ignores the
 * refresh interval. Small and resumable — a worker gets killed long before a
 * hundred thousand listings have been read, so each run does a bounded slice
 * and running it again continues where it stopped.
 */
export const POST = withErrorLog("sold-overnight-build", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  const url = new URL(request.url);

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

  if (url.searchParams.get("again") === "1") await refreshNow();

  const result = await runSweep({ maxCalls, discovery, pages });
  return NextResponse.json(result);
});

/** Same thing on a GET, so it can be run from the address bar. */
export const GET = POST;
