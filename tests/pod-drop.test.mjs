import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = name => readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8");

test("the drop never claims a sale it cannot see", () => {
  /* The discipline the whole product runs on: eRank data and counted numbers
     are evidence, an inference dressed as a fact is not. Etsy publishes no
     sales, its ranking mixes keyword match with performance, and new listings
     get a visibility boost — so "top seller" would be a guess printed as a
     number, and the first seller to click one and find four reviews would stop
     believing the rest of the page. */
  const surfaces = [read("pod-drop.ts"), read("drop/page.tsx"), read("api/drop/route.ts")];
  for (const source of surfaces)
    for (const forbidden of [/best[- ]?sell/i, /top[- ]?sell/i, /revenue/i, /\bearn(ed|ing|s)\b/i])
      assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\//g, ""), forbidden,
        `the drop must not claim sales: ${forbidden}`);
});

test("saves-per-day is suppressed while a listing is too new to have a rate", () => {
  /* Sixty saves on a four-day-old listing is not fifteen a day; the denominator
     is too small to mean anything, and left alone it would top every chart it
     appeared in and make the drop useless. */
  const source = read("pod-drop.ts");
  assert.match(source, /MIN_AGE_DAYS\s*=\s*7/);
  assert.match(source, /ageDays >= MIN_AGE_DAYS \? Number\(\(favorites \/ ageDays\)/);
});

test("publishing outranks the drop for Etsy capacity", () => {
  /* Somebody's batch going out is what they paid for. Today's intel can be
     yesterday's for another hour. */
  const source = read("pod-drop.ts");
  assert.match(source, /BUDGET_FLOOR/);
  assert.match(source, /budget\.remaining < BUDGET_FLOOR/);
  assert.match(read("api/whats-selling/route.ts"), /budget\.remaining < 50/);
});

test("the drop is built once a day for everybody, not once per seller", () => {
  /* The only reason this is affordable. One claim, one build, one row per
     category per day, read by every seller. */
  const source = read("pod-drop.ts");
  assert.match(source, /pod_drop_state SET building_day/);
  assert.match(source, /building_since<datetime\('now','-10 minutes'\)/,
    "an abandoned build must be retakeable or one crash freezes the drop forever");
  assert.match(source, /pod_drop_snapshots/);
});

test("each shelf uses an explicit product search and resumes partial builds", () => {
  const source = read("pod-drop.ts");
  for (const query of ["t shirt", "sweatshirt", "hoodie", "mug", "tote bag", "phone case"])
    assert.match(source, new RegExp(`query: "${query}"`));
  assert.match(source, /keywords: category\.query/);
  assert.doesNotMatch(source, /seller-taxonomy\/nodes/,
    "duplicate taxonomy names must not silently choose an unrelated Etsy branch");
  assert.match(source, /SELECT 1 ok FROM pod_drop_snapshots WHERE day_taxonomy=\?/,
    "a retry must keep completed product searches instead of spending them again");
  assert.match(source, /listing_type === "download"/,
    "explicit digital downloads do not belong on the physical-product shelf");
});

test("the streak is earned from real listings and cannot be tapped", () => {
  /* No check-in button. A star is a day something actually published, read out
     of the publish record — so it cannot be gamed by opening the tab, and
     everybody's history is already there the day this ships. */
  const source = read("pod-drop.ts");
  assert.match(source, /STREAK_TARGET = 5/);
  assert.match(source, /STREAK_WINDOW = 7/);
  assert.match(source, /printify_draft_results WHERE user_id=\? AND status='succeeded'/);
  assert.match(source, /datetime\('now','-6 days'\)/, "rolling seven days, not a Monday reset");
  assert.doesNotMatch(source, /check[_-]?in/i, "there is no button to press");
});

test("the streak copy never scolds", () => {
  /* An accountability feature that tells somebody they are behind is a
     cancellation feature. Every state says how far along they are or that they
     made it. */
  const source = read("pod-drop.ts") + read("drop/page.tsx");
  for (const forbidden of [/behind/i, /you failed/i, /broke your/i, /lost your streak/i, /don't break/i])
    assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\//g, ""), forbidden);
});

test("the week resets the access and never the history", () => {
  /* The commercial engine: everything re-locks on Monday so the tool is worth
     opening in week forty. The line that keeps it from being a punishment is
     that the cards already turned are kept — losing something earned stings
     about twice as hard as gaining it, which is the discouragement this whole
     design exists to avoid. */
  const source = read("unlocks.ts");
  assert.match(source, /substr\(COALESCE\(created_at,updated_at\),1,10\) >= \?/,
    "the counter is scored on this week's listings");
  assert.match(source, /export function weekStart/);
  assert.match(source, /ORDER BY ordinal DESC LIMIT 30/,
    "every card ever turned is still read back — history does not reset");
  assert.match(source, /COALESCE\(MAX\(ordinal\),0\) top FROM unlock_cards WHERE user_id=\?/,
    "ordinals keep climbing across weeks");
  assert.match(read("unlock-cards.tsx"), /yours to keep/);
});

test("a card is only ever bonus intel, and an empty pack does not spend it", () => {
  const unlocks = read("unlocks.ts");
  /* Nothing a seller needs to get work out may sit behind a card, or the game
     becomes a paywall inside a subscription. */
  for (const milestone of ["full-drop", "climbers", "lookup", "vault"])
    assert.match(unlocks, new RegExp(`key: "${milestone}"`), `${milestone} is intel, not function`);
  assert.doesNotMatch(unlocks, /publish|draft_job|printify_draft_jobs/i,
    "no listing capability is ever gated behind a card");
  assert.match(unlocks, /if \(!pick\) return null;/,
    "nothing to give must not burn the card");
});

test("nothing in the card system is scored on a sale", () => {
  const source = read("unlocks.ts") + read("unlock-cards.tsx");
  for (const forbidden of [/\bsold\b/i, /\bsales\b/i, /revenue/i, /conversion/i])
    assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\//g, ""), forbidden,
      "the counter moves on work going out, which is the only part a seller controls");
});

test("a day already read is never taken back", () => {
  /* The weekly reset is the engine and this is the thing that keeps it from
     souring. Monday re-locks what is NEW; every day already opened stays open
     at the depth it was opened, forever. You keep what you have seen and you
     earn what is new. */
  const lib = read("pod-drop.ts");
  assert.match(lib, /export async function markSeen/);
  assert.match(lib, /depth=MAX\(depth,excluded\.depth\)/,
    "listing more in the afternoon opens the morning further, never closes it");
  assert.match(lib, /export async function readArchive/);
  /* The archive replays real snapshots, so they have to outlive the two days
     the diff needs — a fortnight's retention would empty it underneath them. */
  assert.match(lib, /pod_drop_snapshots WHERE day < date\('now','-400 days'\)/);
  assert.match(read("api/drop/route.ts"), /await markSeen\(user\.userId, day, depth\)/);
  assert.match(read("drop/page.tsx"), /never what you have already seen/);
});
