import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
/* The helper is TypeScript, so the test compiles it the way the other suites do
   — strip the annotations rather than pull in a build step for four functions. */
const source = await readFile(new URL("app/listing-goal.ts", root), "utf8");
const js = source
  .replace(/^export type[\s\S]*?;$/gm, "")
  .replace(/: *(?:Date|string|number|boolean|void)\b/g, "")
  .replace(/: *"week" *\| *"month"/g, "")
  .replace(/: *Array<\{[^}]*\}>/g, "")
  .replace(/: *ListingGoal\b/g, "")
  /* D700 · publishedWhen takes a single PublishedBatch; until now only the array
     form existed. One rule covering both, because two rules in the wrong order
     strip ": PublishedBatch" and leave the "[]" behind. */
  .replace(/: *PublishedBatch\b(?:\[\])?/g, "")
  /* D708 · publishedDaysSince/ThisPeriod and periodHistoryFromDays take
     PublishedDay[]. Same shape of rule as the D700 one above, and for the same
     reason: strip the name and any trailing [] in one pass. */
  .replace(/: *PublishedDay\b(?:\[\])?/g, "")
  .replace(/: *unknown\b/g, "")
  .replace(/ as [A-Za-z<>\[\]{}."|, ]+/g, "")
  .replace(/<[A-Za-z]+>\(/g, "(")
  .replace(/export /g, "");
const module = await import(
  `data:text/javascript,${encodeURIComponent(js + "\nexport { periodStart, publishedSince, periodHistory, publishedDaysSince, publishedDaysThisPeriod, periodHistoryFromDays };")}`
);
const { periodStart, publishedSince, periodHistory, publishedDaysSince, publishedDaysThisPeriod, periodHistoryFromDays } = module;

test("a week starts on Monday — D339", () => {
  /* Sunday's work belongs to the week that is ending, not the one starting. */
  const sunday = new Date(2026, 7, 23);
  assert.equal(periodStart("week", sunday).getDate(), 17);
  const monday = new Date(2026, 7, 24);
  assert.equal(periodStart("week", monday).getDate(), 24);
});

test("a month starts on the first — D339", () => {
  assert.equal(periodStart("month", new Date(2026, 7, 23)).getDate(), 1);
});

test("only published listings inside the period count — D339", () => {
  const batches = [
    { created_at: new Date(2026, 7, 24).toISOString(), published_count: 9 },
    { created_at: new Date(2026, 7, 25).toISOString(), published_count: 5 },
    { created_at: new Date(2026, 7, 10).toISOString(), published_count: 40 },
    { created_at: new Date(2026, 7, 25).toISOString(), published_count: 0 },
    { created_at: null, published_count: 7 },
  ];
  assert.equal(publishedSince(batches, periodStart("week", new Date(2026, 7, 26))), 14);
});

test("history stops at the last period with work — D339", () => {
  /* Padding empty weeks onto the end reads as a run of failures rather than as
     "you had not started yet". */
  const batches = [{ created_at: new Date(2026, 7, 24).toISOString(), published_count: 12 }];
  const rows = periodHistory(batches, "week", 8, new Date(2026, 7, 26));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].published, 12);
});

test("the goal is one switch, off by default — D341", async () => {
  const api = await readFile(new URL("app/api/seller-preferences/route.ts", root), "utf8");
  const app = await readFile(new URL("app/listing-factory-app.tsx", root), "utf8");
  const ui = await readFile(new URL("app/goldie-ui.tsx", root), "utf8");

  assert.match(api, /enabled: raw\.enabled === true/, "off unless explicitly turned on");
  assert.match(api, /target: Math\.max\(1,/, "a goal of zero is a bar that is always full");

  /* The sidebar and the receipt are the same feature seen twice — they cannot
     be enabled separately, so both read the one value. */
  assert.match(app, /if\(result\.listingGoal\?\.enabled\)setListingGoal\(result\.listingGoal\)/);
  assert.match(app, /\{listingGoal&&goalDaysLoaded&&<a className="listing-goal-side"/);
  assert.match(app, /goalLine=\{listingGoal\?/);
  assert.match(ui, /\{goalLine&&<p className="receipt-goal">/);
});

test("a fee save cannot wipe the goal, or the goal the fees — D339", async () => {
  const api = await readFile(new URL("app/api/seller-preferences/route.ts", root), "utf8");
  assert.match(api, /if \(body\.pricing !== undefined\)/);
  assert.match(api, /if \(body\.listingGoal !== undefined\) merged\.listingGoal/);
  assert.match(api, /const merged: Record<string, unknown> = \{ \.\.\.existing \};/,
    "both halves live in one blob, so the write has to merge");
});

test("nothing shows a deficit, and the bar may exceed the goal — D342", async () => {
  const app = await readFile(new URL("app/listing-factory-app.tsx", root), "utf8");
  const goals = await readFile(new URL("app/goals/page.tsx", root), "utf8");
  /* Scoped to the goal markup — "behind" appears elsewhere in unrelated copy
     ("printed behind your art"), and a whole-file grep would fail on that. */
  const sidebar = app.slice(app.indexOf('className="listing-goal-side"'), app.indexOf('className="listing-goal-side"') + 400);
  for (const [name, source] of [["sidebar", sidebar], ["goals page", goals]]) {
    assert.doesNotMatch(source, /behind|to go|short of|missed/i, `${name} must not frame progress as a deficit`);
  }
  /* Progress is capped for the BAR's width only — the count itself keeps going. */
  assert.match(app, /Math\.min\(100,Math\.round\(\(goalDone\/Math\.max\(1,listingGoal\.target\)\)\*100\)\)/);
  assert.match(app, /\{goalDone\} of \{listingGoal\.target\}/, "the number is not capped");
});


/* D708 · The count must be a fact about the publish records, not about which
   page of batch history happens to be loaded. */
test("the weekly count does not fall when unrelated batches are created — D708", () => {
  const now = new Date(2026, 7, 29);            /* Saturday 29 Aug 2026 */
  const monday = periodStart("week", now);
  assert.equal(monday.getDate(), 24, "weeks start Monday");

  /* Her real data: three publishes inside the week, on three separate days. */
  const days = [
    { day: "2026-08-29", count: 2 },
    { day: "2026-08-28", count: 2 },
    { day: "2026-08-26", count: 2 },
    { day: "2026-08-20", count: 5 },            /* previous week, excluded */
  ];
  assert.equal(publishedDaysSince(days, monday), 6);

  /* This is the regression itself. Under the old code the number was summed
     from /api/batches, which is LIMIT 20, so starting three new batches pushed
     a published one off the end and 6 became 4 with nothing published and
     nothing deleted. Day rows are counted server-side across every publish
     item, so adding batches cannot change them. */
  assert.equal(publishedDaysSince(days, monday), 6, "adding batches does not move the count");

  assert.equal(publishedDaysThisPeriod(days, { enabled: true, period: "week", target: 20 }, now), 6);
});

test("a published day is read in local time, not UTC — D708", () => {
  /* new Date("2026-08-24") is UTC midnight, which is Sunday 23rd anywhere west
     of Greenwich. Parsed that way, a Monday publish falls out of the Monday
     week for every seller in the Americas. */
  const monday = new Date(2026, 7, 24);
  assert.equal(publishedDaysSince([{ day: "2026-08-24", count: 3 }], monday), 3);
});

test("malformed or empty day rows are ignored, not counted as today — D708", () => {
  const monday = new Date(2026, 7, 24);
  assert.equal(publishedDaysSince([{ day: "", count: 9 }, { day: null, count: 9 }, { day: "not-a-date", count: 9 }], monday), 0);
  assert.equal(publishedDaysSince([{ day: "2026-08-26", count: -4 }], monday), 0, "a negative count cannot subtract");
});
