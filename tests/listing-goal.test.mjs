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
  .replace(/: *PublishedBatch\[\]/g, "")
  .replace(/: *unknown\b/g, "")
  .replace(/ as [A-Za-z<>\[\]{}."|, ]+/g, "")
  .replace(/<[A-Za-z]+>\(/g, "(")
  .replace(/export /g, "");
const module = await import(
  `data:text/javascript,${encodeURIComponent(js + "\nexport { periodStart, publishedSince, periodHistory };")}`
);
const { periodStart, publishedSince, periodHistory } = module;

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
  assert.match(app, /\{listingGoal&&<a className="listing-goal-side"/);
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
