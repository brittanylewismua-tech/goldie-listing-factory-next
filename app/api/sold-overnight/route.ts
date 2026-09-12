import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { withErrorLog } from "@/app/error-log";
import { buildNight, previousNight, readBoard } from "@/app/sold-overnight";
import { unlockState } from "@/app/unlocks";
import { listingStreak, STREAK_TARGET } from "@/app/pod-drop";

/**
 * SOLD OVERNIGHT — the board, and how much of it this seller has opened.
 *
 * Reading costs no Etsy calls at all: the counting happened overnight and the
 * answer is already in the database. What a page load may do is advance the
 * sweep by a few requests, because this app has no scheduler and the first
 * people through the door each morning are what moves it along. That work is
 * strictly bounded, so nobody waits on a thousand-call read to see a page.
 *
 * A sweep that cannot run is never an error. Last night's board is a perfectly
 * good board, and somebody who came here to list should not be shown a failure
 * about a background job.
 */

/** How much of the board is visible before this week has been earned. */
const PREVIEW = 12;

/** Requests a page load may spend nudging tonight's sweep along. */
const NUDGE = 4;

export const GET = withErrorLog("sold-overnight", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to see what sold overnight." }, { status: 401 });

  let sweeping = false;
  try {
    const run = await buildNight({ maxCalls: NUDGE, discovery: false });
    sweeping = run.built === true && run.done === false;
  } catch {
    /* Last night's board stands. */
  }

  const asked = new URL(request.url).searchParams.get("night");
  const wants = /^\d{4}-\d{2}-\d{2}$/.test(asked ?? "") ? asked! : undefined;

  const [board, streak, unlocks] = await Promise.all([
    readBoard(200, wants),
    listingStreak(user.userId),
    unlockState(user.userId),
  ]);

  /*
    THE SAME TWO DOORS AS THE HOT LIST, deliberately. A second, different
    unlock scheme would be a second thing to learn for no reason — this is one
    more shelf in the same shop, not a separate reward system.
  */
  const unlocked = streak.hit || unlocks.milestones.some(m => m.key === "full-drop" && m.unlocked);
  const listings = unlocked ? board.listings : board.listings.slice(0, PREVIEW);

  return NextResponse.json({
    ...board,
    listings,
    sweeping,
    unlocked,
    held: unlocked ? 0 : Math.max(0, board.listings.length - listings.length),
    toUnlock: unlocked ? 0 : Math.max(0, STREAK_TARGET - streak.count),
    viewing: wants ?? null,
    back: board.night ? await previousNight(board.night) : null,
  });
});
