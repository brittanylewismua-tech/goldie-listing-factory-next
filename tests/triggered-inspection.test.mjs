/**
 * THE SIXTEEN WAYS THIS CAN GO WRONG.
 *
 * Half of these are decided by pure logic and are exercised directly. The
 * other half — running a job twice, delivering an interval twice, a firing
 * dying halfway — are decided by SQL constraints and lock behaviour, and are
 * pinned by reading the statements that enforce them. A comment claiming
 * idempotency is worth nothing; a unique index is worth something, so the test
 * checks the index exists.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { diffSnapshots, salesLinked } from "../app/market-events.ts";

const read = name => readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8");
const store = read("market-store.ts");
const sensor = read("shop-sensor.ts");
const inspector = read("triggered-inspection.ts");

const snap = (over = {}) => ({
  listingId: 1, shopId: 10, observedAt: "2026-09-13T10:00:00.000Z",
  quantity: 50, state: "active", priceCents: 4200, favorites: 30, views: 600,
  lastModified: 1_780_000_000, originalCreated: 1_700_000_000, taxonomyId: 1855,
  titleHash: "t1", tagsHash: "g1", imageHash: "i1", ...over,
});
const later = (over = {}) => snap({ observedAt: "2026-09-13T10:20:00.000Z", ...over });
const move = (id, from, to, extra = {}) =>
  diffSnapshots(snap({ listingId: id, quantity: from }), later({ listingId: id, quantity: to, ...extra }));

test("1 · shop sold one, one listing fell by one", () => {
  const out = salesLinked(move(1, 50, 49), 1, 12);
  assert.equal(out.linked.length, 1);
  assert.equal(out.unresolved, 0);
});

test("2 · shop sold three, only one unit is attributable", () => {
  const out = salesLinked(move(1, 50, 49), 3, 12);
  assert.equal(out.linked[0].units, 1);
  assert.equal(out.unresolved, 2);
});

test("3 · several listings account for the increase exactly", () => {
  const events = [...move(1, 50, 49), ...move(2, 50, 48)];
  const out = salesLinked(events, 3, 20);
  assert.equal(out.linked.reduce((n, row) => n + row.units, 0), 3);
  assert.equal(out.unresolved, 0);
});

test("4 · a quantity fall with no shop movement is not a sale", () => {
  assert.deepEqual(salesLinked(move(1, 50, 40), 0, 12).linked, []);
});

test("5 · shop sales rise with no listing movement stay wholly unresolved", () => {
  const out = salesLinked([], 4, 12);
  assert.deepEqual(out.linked, []);
  assert.equal(out.unresolved, 4);
});

test("6 · a drop and a sold-out state are one movement, not two", () => {
  const events = diffSnapshots(
    snap({ quantity: 1 }), later({ quantity: 0, state: "sold_out" }));
  const out = salesLinked(events, 2, 12);
  assert.equal(out.linked.length, 1, "one listing, one claim");
  assert.equal(out.linked[0].units, 1);
  assert.equal(out.unresolved, 1);
});

test("7 · a listing renewing after selling out is credited once", () => {
  const events = diffSnapshots(
    snap({ quantity: 0, state: "sold_out" }),
    later({ quantity: 20, state: "active", lastModified: 1_780_000_900 }));
  const out = salesLinked(events, 1, 12);
  assert.equal(out.linked.length, 1);
  assert.equal(out.linked[0].reason, "renewed_after_sold_out");
});

test("8 · a broad manual update conflicts the whole interval", () => {
  const events = [1, 2, 3, 4, 5, 6].flatMap(id => move(id, 50, 49));
  const out = salesLinked(events, 6, 10);
  assert.equal(out.conflicted, true);
  assert.deepEqual(out.linked, []);
  assert.equal(out.unresolved, 6);
});

test("12 · a listing with no previous snapshot yields a baseline, not a movement", () => {
  assert.match(inspector, /if \(!before\) \{\s*\n\s*baselinesEstablished \+= 1;\s*\n\s*continue;/);
  assert.match(inspector, /A FIRST LOOK IS A BASELINE, NEVER A MOVEMENT/);
});

test("13 · sold-out listings are inspected, not filtered out", () => {
  /* Filtering to active listings would throw away the clearest evidence
     there is. The query must not carry a state filter. */
  const query = inspector.slice(inspector.indexOf("FROM sold_watch WHERE shop_id"), inspector.indexOf("FROM sold_watch WHERE shop_id") + 120);
  assert.doesNotMatch(query, /state\s*=\s*'active'/);
});

test("14 · attributed units can never exceed the shop increase", () => {
  const events = [1, 2, 3].flatMap(id => move(id, 50, 45));
  const out = salesLinked(events, 4, 40);
  assert.equal(out.linked.reduce((n, row) => n + row.units, 0), 4);
});

test("9 · running the same inspection twice cannot double anything", () => {
  /* Events and credited units are both protected by unique indexes, so the
     second run writes nothing rather than doubling the count. */
  assert.match(store, /CREATE UNIQUE INDEX IF NOT EXISTS listing_events_once/);
  assert.match(store, /ON listing_events \(listing_id, type, previous_observed_at, observed_at\)/);
  assert.match(store, /CREATE UNIQUE INDEX IF NOT EXISTS listing_sales_activity_once/);
  assert.match(store, /ON listing_sales_activity \(listing_id, interval_id\)/);
  assert.match(store, /INSERT OR IGNORE INTO listing_events/);
  assert.match(store, /INSERT OR IGNORE INTO listing_sales_activity/);
});

test("10 · the same sensor interval delivered twice becomes one row", () => {
  assert.match(store, /CREATE UNIQUE INDEX IF NOT EXISTS shop_sales_intervals_once/);
  assert.match(store, /ON shop_sales_intervals \(shop_id, from_observed, to_observed\)/);
  assert.match(store, /ON CONFLICT\(shop_id, from_observed, to_observed\) DO NOTHING/);
  /* And the queue is keyed on the interval, so one interval is one job. */
  assert.match(store, /ON CONFLICT\(interval_id\) DO NOTHING/);
});

test("11 · an inspection that fails is retried, and never disappears", () => {
  assert.match(inspector, /exhausted \? "failed" : "queued"/);
  assert.match(inspector, /MAX_ATTEMPTS/);
  /* A job orphaned by a firing that died is reclaimed rather than left
     running forever. */
  assert.match(inspector, /state = 'running' AND started_at </);
});

test("15 · a representative that stops answering is replaced", () => {
  assert.match(sensor, /misses >= \?/);
  assert.match(sensor, /replaceStaleRepresentatives/);
  /* And silence is counted rather than ignored. */
  assert.match(sensor, /SET misses = misses \+ 1/);
});

test("16 · two sensor cycles cannot overlap", () => {
  assert.match(sensor, /claimLock\("shop-sensor"/);
  assert.match(inspector, /claimLock\("triggered-inspection"/);
  /* The lock has to expire on its own, or a killed firing wedges it shut. */
  assert.match(store, /WHERE market_locks\.expires_at < \?/);
});

test("variation-level inventory ships off, and the reason is written down", () => {
  assert.match(inspector, /MARKET_VARIATION_INVENTORY/);
  assert.match(inspector, /=== "on"/);
  assert.match(inspector, /until Etsy confirms/i);
});

test("the unresolved remainder is never apportioned", () => {
  /* The whole product rests on this. Six listings, one explained sale, five
     unresolved — and nothing anywhere divides the five up. */
  const out = salesLinked(move(1, 50, 49), 6, 30);
  assert.equal(out.unresolved, 5);
  assert.equal(out.linked.length, 1);
});

test("an interval with no job is adopted rather than stranded", () => {
  /* Measured in production: 800 intervals, 278 jobs. Five hundred real shop
     sales with nothing intending to look at them — the silent loss this whole
     design exists to prevent. */
  assert.match(inspector, /LEFT JOIN inspection_jobs j ON j\.interval_id = i\.id/);
  assert.match(inspector, /WHERE j\.interval_id IS NULL AND i\.inspected_at IS NULL/);
});

test("request telemetry reads the shared meter, not this feature's own tally", () => {
  /* The allowance belongs to the Etsy application; World Builder spends from
     the same key. Counting only our own calls invents headroom. */
  const health = readFileSync(new URL("../app/api/market/health/route.ts", import.meta.url), "utf8");
  assert.match(health, /FROM etsy_api_usage_buckets/);
  assert.match(health, /GROUP BY feature/);
  assert.doesNotMatch(health, /FROM sold_spend/);
});

test("every attribution denominator is reported, not whichever reads best", () => {
  /* Four now, because a wider net without clearer denominators would just be
     a better-looking number: units observed, units from intervals where the
     shop was fully known first, and the same two counted by shop. */
  const health = readFileSync(new URL("../app/api/market/health/route.ts", import.meta.url), "utf8");
  assert.match(health, /rawCoveragePercent/);
  assert.match(health, /eligibleCoveragePercent/);
  assert.match(health, /shopCoveragePercent/);
  assert.match(health, /preBaselineUnresolved/);
});
