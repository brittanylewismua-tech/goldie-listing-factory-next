import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { withErrorLog } from "@/app/error-log";
import { buildDrop, forgetToday, lastWeek, listingStreak, markSeen, readDropFor, readDrop, seenDepth, STREAK_TARGET } from "@/app/pod-drop";
import { getChatGPTUser as owner } from "@/app/chatgpt-auth";
import { isOwner } from "@/app/mastermind/access";
import { unlockState } from "@/app/unlocks";

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

async function handleGET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to see today's hot list." }, { status: 401 });

  let building = false;
  let unavailable = false;
  try {
    building = (await buildDrop()).built;
  } catch {
    /* Yesterday remains useful. On the first day there is no fallback, so the
       page must say the read failed instead of pretending it is still running. */
    unavailable = true;
  }

  /*
    ?day= asks for one earlier shelf, laid out exactly like today's. One step
    back is the whole feature — a seller wants to put last week beside this
    week, not browse a library.
  */
  const asked = new URL(request.url).searchParams.get("day");
  const wants = /^\d{4}-\d{2}-\d{2}$/.test(asked ?? "") ? asked! : null;

  const [{ day, categories }, streak, unlocks] = await Promise.all([
    readDrop(), listingStreak(user.userId), unlockState(user.userId),
  ]);

  /* Two ways in, both weekly: five listing days, or three listings. The week
     is the season — everything re-locks on Monday so the tool is worth opening
     in week forty as much as in week one. What never re-locks is the cards
     they turned; those are history and history is theirs. */
  const unlocked = streak.hit || unlocks.milestones.some(m => m.key === "full-drop" && m.unlocked);
  const depth = unlocked ? 30 : PREVIEW;

  /* Recorded before it is returned, so this day is theirs at this depth from
     now on. The week's access re-locks on Monday; a day already read never
     does. You keep what you have seen and earn what is new. */
  if (categories.length) await markSeen(user.userId, day, depth);
  /* Offered only when it exists, so the button is never a door onto nothing. */
  const previousDay = lastWeek(day);
  const previous = await readDropFor(previousDay);
  const back = previous.length ? previousDay : null;

  const showing = wants ? await readDropFor(wants) : null;
  /* Weekly access can reset; a view already earned cannot. A seller who opened
     all 30 last week still sees those 30 when comparing that day today. */
  const effectiveDepth = wants && showing?.length
    ? Math.max(depth, await seenDepth(user.userId, wants))
    : depth;
  return NextResponse.json({
    day,
    /* Said plainly, because "today's hot list" dated yesterday would otherwise
       look like a bug rather than a quiet morning. */
    fresh: day === new Date().toISOString().slice(0, 10),
    building,
    unavailable: unavailable && categories.length === 0,
    unlocked,
    lockedCount: unlocked ? 0 : Math.max(0, STREAK_TARGET - streak.count),
    streak,
    unlocks,
    /* The one step back, and which day it is. */
    back,
    viewing: wants && showing?.length ? wants : null,
    categories: (showing?.length ? showing : categories).map(category => {
      const available = Math.min(30, category.listings.length);
      const visible = Math.min(available, effectiveDepth);
      return {
        ...category,
        /* What the ranking is a ranking OF. "Top 30" is a claim, and a claim
           needs its denominator where the reader can see it. */
        matched: category.listings[0]?.matched ?? 0,
        listings: category.listings.slice(0, visible),
        held: Math.max(0, available - visible),
      };
    }),
  });
}

export const GET = withErrorLog("drop", handleGET);

/**
 * Rebuild today's hot list. Owner only, and no longer drawn anywhere.
 *
 * It existed as a button while the drop was being built and a fix otherwise
 * had to wait a night to be seen. That is over: the drop rebuilds itself on
 * the first visit each morning, so the button was a control with a real cost
 * — roughly two dozen Etsy calls a press — and no everyday reason to exist.
 *
 * The route stays, because a build that fails halfway leaves a thin day and
 * this is how that gets repaired without waiting for tomorrow. It is reached
 * deliberately or not at all.
 */
async function handlePOST() {
  const user = await owner();
  if (!user || !isOwner(user))
    return NextResponse.json({ error: "Not for you." }, { status: 403 });
  await forgetToday();
  const built = await buildDrop();
  return NextResponse.json({ rebuilt: built.built, why: built.why ?? null });
}

export const POST = withErrorLog("drop", handlePOST);
