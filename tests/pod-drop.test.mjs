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
