import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { withErrorLog } from "@/app/error-log";
import { readBoard, runSweep } from "@/app/sold-overnight";
import { unlockState } from "@/app/unlocks";
import { listingStreak, STREAK_TARGET } from "@/app/pod-drop";

/**
 * SOLD OVERNIGHT — the board, and how much of it this seller has opened.
 *
 * Reading costs no Etsy calls: the counting already happened and the answer is
 * in the database. A page load may nudge the sweep along by a few requests,
 * because a cron and a doorway are better than a cron alone — but that work is
 * bounded and nobody waits on it.
 */

/** How much of the board is visible before this week has been earned. */
const PREVIEW = 12;

/** Requests a page load may spend nudging the sweep along. */
const NUDGE = 4;

export const GET = withErrorLog("sold-overnight", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to see what sold." }, { status: 401 });

  try {
    await runSweep({ maxCalls: NUDGE, discovery: false });
  } catch {
    /* The board that exists is still the board. */
  }

  const hours = Number(new URL(request.url).searchParams.get("hours"));
  const hoursBack = [24, 48, 168].includes(hours) ? hours : 24;

  const [board, streak, unlocks] = await Promise.all([
    readBoard(400, hoursBack),
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
    unlocked,
    held: unlocked ? 0 : Math.max(0, board.listings.length - listings.length),
    toUnlock: unlocked ? 0 : Math.max(0, STREAK_TARGET - streak.count),
  });
});
