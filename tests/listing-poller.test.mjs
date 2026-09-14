/**
 * THE DETECTOR, AND THE QUESTION IT IS ACTUALLY ANSWERING.
 *
 * Whole-shop attribution measured the wrong thing: a shop selling six units
 * while Goldie monitors two of its listings is not a detector failure. These
 * tests cover polling the monitored corpus directly, corroborating movement
 * against the shop counter, and keeping the two numbers apart.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { diffSnapshots, salesLinked } from "../app/market-events.ts";

const read = name => readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8");
const poller = read("listing-poller.ts");
const store = read("market-store.ts");
const health = read("api/market/health/route.ts");
const handler = readFileSync(
  new URL("../scripts/add-scheduled-handler.mjs", import.meta.url), "utf8");

const snap = (over = {}) => ({
  listingId: 1, shopId: 10, observedAt: "2026-09-14T10:00:00.000Z",
  quantity: 40, state: "active", priceCents: 4200, favorites: 12, views: 300,
  lastModified: 1_780_000_000, originalCreated: 1_700_000_000, taxonomyId: 1855,
  titleHash: "t1", tagsHash: "g1", imageHash: "", ...over,
});
const later = (over = {}) => snap({ observedAt: "2026-09-14T10:10:00.000Z", ...over });

test("the batch limit is measured, not assumed, including one over", () => {
  /* A silently truncated answer would look like success while halving the
     corpus, so the probe asks for 101 as well as 100. */
  assert.match(poller, /ids\.slice\(0, 100\)/);
  assert.match(poller, /ids\.slice\(0, 101\)/);
  assert.match(poller, /documented is not measured/i);
});

test("a first snapshot creates a baseline and no event", () => {
  assert.match(poller, /A FIRST LOOK IS A BASELINE, NEVER A MOVEMENT/);
  assert.match(poller, /if \(!before\) \{ result\.baselines \+= 1; continue; \}/);
});

test("a quantity decrease with a matching shop increase is a sale", () => {
  const events = diffSnapshots(snap(), later({ quantity: 39 }));
  const out = salesLinked(events, 1, 100);
  assert.equal(out.linked.length, 1);
  assert.equal(out.linked[0].units, 1);
});

test("a quantity decrease with no shop increase is never called selling", () => {
  const events = diffSnapshots(snap(), later({ quantity: 39 }));
  assert.deepEqual(salesLinked(events, 0, 100).linked, []);
  /* And it is kept rather than discarded, because a manual edit is worth
     knowing about and silence would hide the distinction. */
  assert.match(poller, /uncorroborated_changes/);
  assert.match(poller, /Movement with nothing behind it/);
});

test("a shop increase with no monitored listing change attributes nothing", () => {
  assert.deepEqual(salesLinked([], 5, 100).linked, []);
  assert.equal(salesLinked([], 5, 100).unresolved, 5);
});

test("more listing decreases than the shop sold are capped at the shop's number", () => {
  const events = [1, 2, 3, 4].flatMap(id =>
    diffSnapshots(snap({ listingId: id }), later({ listingId: id, quantity: 38 })));
  const out = salesLinked(events, 3, 100);
  assert.equal(out.linked.reduce((sum, row) => sum + row.units, 0), 3);
});

test("the cap counts what the interval has already given away", () => {
  /* Two sweeps inside one shop interval must not each spend the whole
     increase, so the remaining room is computed from what is already
     credited against that interval. */
  assert.match(poller, /i\.sold_delta - COALESCE\(/);
  assert.match(poller, /FROM listing_sales_activity a WHERE a\.interval_id = i\.id/);
  assert.match(poller, /Math\.max\(0, Number\(row\.remaining\)\)/);
});

test("a drop and a sold-out state remain one underlying movement", () => {
  const events = diffSnapshots(snap({ quantity: 1 }), later({ quantity: 0, state: "sold_out" }));
  const out = salesLinked(events, 2, 100);
  assert.equal(out.linked.length, 1);
  assert.equal(out.unresolved, 1);
});

test("a sold-out listing stays in the corpus and keeps being read", () => {
  /* Falling out of Etsy's search results is not ceasing to exist, and
     dropping it would make selling out look like a disappearance. */
  assert.match(poller, /never leaves it/);
  assert.doesNotMatch(poller, /DELETE FROM corpus_poll_state/);
  assert.match(poller, /ON CONFLICT\(listing_id\) DO NOTHING/);
});

test("a listing Etsy will not answer for is counted, not guessed at", () => {
  assert.match(poller, /const silent = ids\.filter\(id => !answered\.has\(id\)\)/);
  assert.match(poller, /unavailable_since/);
});

test("a failed batch is retried rather than aged out of the rotation", () => {
  assert.match(poller, /A FAILED BATCH IS RETRIED, NOT SKIPPED/);
  /* last_polled must not advance for a batch that failed. */
  const failure = poller.slice(poller.indexOf("if (!answer.ok) {"), poller.indexOf("result.batchesCompleted += 1"));
  assert.doesNotMatch(failure, /last_polled = /);
});

test("one listing in several watches is still fetched once", () => {
  /* The corpus is keyed on the listing, not on the watch, so membership of
     many watches cannot multiply the cost. */
  assert.match(poller, /listing_id INTEGER PRIMARY KEY/);
  assert.doesNotMatch(poller, /watch_id/);
});

test("two sweeps cannot overlap, and snapshots and events stay idempotent", () => {
  assert.match(poller, /claimLock\("listing-poller"/);
  assert.match(store, /CREATE UNIQUE INDEX IF NOT EXISTS listing_events_once/);
  assert.match(store, /INSERT OR IGNORE INTO listing_snapshots/);
  assert.match(store, /CREATE UNIQUE INDEX IF NOT EXISTS listing_sales_activity_once/);
});

test("freshness is measured against two sweep intervals", () => {
  assert.match(poller, /SWEEP_MINUTES \* 2 \* 60_000/);
  assert.match(poller, /freshWithinTwoSweeps/);
  assert.match(poller, /export const SWEEP_MINUTES = 10;/);
});

test("the poller yields to the workloads that cannot wait", () => {
  assert.match(poller, /POLL_RESERVE/);
  assert.match(poller, /No room left under the daily reserve/);
  assert.match(poller, /FROM etsy_api_usage_buckets/);
});

test("the detector's metrics are about monitored listings, not whole shops", () => {
  assert.match(health, /detector: await detectorHealth\(days\)/);
  assert.match(health, /THE DETECTOR'S OWN SCORE/);
  /* Whole-shop unresolved activity is kept, and explicitly not the score. */
  assert.match(health, /shopLevelActivity/);
  assert.match(health, /Not the product's accuracy score/);
  assert.match(poller, /unitsAttributedToMonitoredListings/);
  assert.match(poller, /batchCompletionPercent/);
});

test("polling tiers exist in the schema but no clever timing is switched on", () => {
  assert.match(poller, /tier TEXT NOT NULL DEFAULT 'general'/);
  assert.match(poller, /export type Tier = "watch" \| "momentum" \| "general" \| "cold";/);
  /* The first production test has to stay easy to read, so the sweep is flat:
     ordered by staleness alone. */
  assert.match(poller, /ORDER BY last_polled IS NULL DESC, last_polled ASC/);
});

test("the ten-minute clock drives the poller and nothing else", () => {
  assert.match(handler, /event\.cron === "\*\/10 \* \* \* \*"/);
  assert.match(handler, /run\("\/api\/market\/poll-tick"\)/);
  assert.match(handler, /if \(everyTenMinutes\) return;/);
  const wrangler = readFileSync(new URL("../wrangler.staging.jsonc", import.meta.url), "utf8");
  assert.match(wrangler, /"\*\/10 \* \* \* \*", "\*\/20 \* \* \* \*"/);
});

test("the lock outlasts a full sweep", () => {
  /* Measured at 2.8 seconds a batch across 154 batches: about seven minutes.
     A five-minute lock would expire mid-sweep and let the next firing start
     on top of it. */
  assert.match(poller, /claimLock\("listing-poller", holder, 900\)/);
  assert.match(poller, /THE LOCK HAS TO OUTLAST THE SWEEP/);
});

test("large shops are not excluded from anything", () => {
  /* Direct batch polling makes shop size irrelevant once a listing is in the
     corpus, so no size threshold may appear in the poller. */
  assert.doesNotMatch(poller, /MAX_LISTINGS_PER_SHOP|too many listings|skip.*large shop/i);
});

test("an upsert built on a SELECT carries a WHERE, or SQLite refuses it", () => {
  /* Measured in production: `near "DO": syntax error`. SQLite cannot tell
     whether ON CONFLICT belongs to the INSERT or the SELECT unless the SELECT
     has a WHERE, so every INSERT-SELECT upsert in the codebase must have one. */
  const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = `${dir}/${entry.name}`;
    return entry.isDirectory() ? walk(path) : path.endsWith(".ts") ? [path] : [];
  });
  const offenders = [];
  for (const path of walk(new URL("../app", import.meta.url).pathname)) {
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(/INSERT INTO[\s\S]{0,600}?ON CONFLICT/g)) {
      const chunk = match[0];
      if (/\bSELECT\b/.test(chunk) && !/\bWHERE\b/.test(chunk))
        offenders.push(`${path.split("/app/")[1]}: ${chunk.slice(0, 80).replace(/\s+/g, " ")}`);
    }
  }
  assert.deepEqual(offenders, [], "an INSERT-SELECT upsert without a WHERE will not parse");
});

test("the whole-shop backfill is not on any clock", () => {
  /* The estimate killed it as a production path and every firing it did get
     timed out. The endpoint stays for research; nothing schedules it. */
  assert.doesNotMatch(handler, /baseline-tick/);
  assert.match(handler, /Whole-shop enumeration is NOT on the clock/);
});
