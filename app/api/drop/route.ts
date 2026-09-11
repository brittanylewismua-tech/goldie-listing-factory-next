import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { withErrorLog } from "@/app/error-log";
import { buildDrop, listingStreak, readDrop, STREAK_TARGET } from "@/app/pod-drop";

/**
 * THE DAILY DROP, AND THE SELLER'S OWN WEEK.
 *
 * Built lazily rather than on a schedule: this app has no cron, and the first
 * seller through the door each morning pays for a build the rest read from
 * cache. That is one dozen Etsy calls a day for everybody, and it needs no
 * infrastructure that does not already exist.
 *
 * A build that cannot run — Etsy quiet, capacity reserved for publishing,
 * another request already building — is never an error. Yesterday's drop is a
 * perfectly good drop, and a seller who came to list should not be met with a
 * failure about a sidebar.
 *
 * THE BONUS. Five listing days in the last seven opens the whole shelf: thirty
 * per category instead of ten, and the movement that goes with it. The reward
 * for showing up is more of the thing they came for — not a badge, not
 * credits. Credits would teach them the streak is worth money; a trophy would
 * be a gold star handed to an adult running a business.
 */

const PREVIEW = 10;

async function handleGET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to see today's drop." }, { status: 401 });

  let building = false;
  let unavailable = false;
  try {
    building = (await buildDrop()).built;
  } catch {
    /* Yesterday remains useful. On the first day there is no fallback, so the
       page must say the read failed instead of pretending it is still running. */
    unavailable = true;
  }

  const [{ day, categories }, streak] = await Promise.all([readDrop(), listingStreak(user.userId)]);

  const unlocked = streak.hit;
  return NextResponse.json({
    day,
    /* Said plainly, because "today's drop" dated yesterday would otherwise
       look like a bug rather than a quiet morning. */
    fresh: day === new Date().toISOString().slice(0, 10),
    building,
    unavailable: unavailable && categories.length === 0,
    unlocked,
    lockedCount: unlocked ? 0 : Math.max(0, STREAK_TARGET - streak.count),
    streak,
    categories: categories.map(category => ({
      ...category,
      listings: unlocked ? category.listings : category.listings.slice(0, PREVIEW),
      held: unlocked ? 0 : Math.max(0, category.listings.length - PREVIEW),
    })),
  });
}

export const GET = withErrorLog("drop", handleGET);
