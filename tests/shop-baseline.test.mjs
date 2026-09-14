/**
 * WHOLE-SHOP COVERAGE, AND THE RULES THAT KEEP IT HONEST.
 *
 * The corpus held 2.2 listings per shop, which made most sales unexplainable
 * by construction — not by any failure of the attribution rules. These tests
 * cover the enumeration that fixes it and, more importantly, the distinctions
 * that stop a wider net turning into looser claims.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { diffSnapshots, salesLinked } from "../app/market-events.ts";

const read = name => readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8");
const baseline = read("shop-baseline.ts");
const inspector = read("triggered-inspection.ts");
const store = read("market-store.ts");
const health = read("api/market/health/route.ts");

const snap = (over = {}) => ({
  listingId: 1, shopId: 10, observedAt: "2026-09-14T10:00:00.000Z",
  quantity: 20, state: "active", priceCents: null, favorites: null, views: null,
  lastModified: 1_780_000_000, originalCreated: 1_700_000_000, taxonomyId: 1855,
  titleHash: "t1", tagsHash: "", imageHash: "", ...over,
});
const later = (over = {}) => snap({ observedAt: "2026-09-14T10:20:00.000Z", ...over });

test("pagination walks a shop to the end, and stops on a short page", () => {
  assert.match(baseline, /if \(page\.listings\.length < PAGE\) \{ complete = true; break; \}/);
  assert.match(baseline, /if \(offset >= total\) \{ complete = true; break; \}/);
  /* And it resumes rather than restarting, so a shop interrupted halfway is
     not re-read from zero every firing. */
  assert.match(baseline, /next_offset/);
  assert.match(baseline, /let offset = Number\(held\?\.next_offset \?\? 0\)/);
});

test("a shop too big for the page cap is partial, never falsely complete", () => {
  assert.match(baseline, /MAX_PAGES_PER_SHOP/);
  assert.match(baseline, /if \(!complete\) truncated = true;/);
  assert.match(baseline, /complete \? "complete" : "partial"/);
});

test("a listing selling after a valid baseline is attributed", () => {
  const events = diffSnapshots(snap(), later({ quantity: 19 }));
  const out = salesLinked(events, 1, 40);
  assert.equal(out.linked.length, 1);
  assert.equal(out.unresolved, 0);
});

test("several listings changing in one interval share the increase exactly", () => {
  const events = [1, 2, 3].flatMap(id =>
    diffSnapshots(snap({ listingId: id }), later({ listingId: id, quantity: 19 })));
  const out = salesLinked(events, 3, 60);
  assert.equal(out.linked.reduce((n, row) => n + row.units, 0), 3);
  assert.equal(out.unresolved, 0);
});

test("more shop sales than listing evidence leaves the remainder unresolved", () => {
  const out = salesLinked(diffSnapshots(snap(), later({ quantity: 19 })), 5, 40);
  assert.equal(out.linked.reduce((n, row) => n + row.units, 0), 1);
  assert.equal(out.unresolved, 4);
});

test("more listing movement than the shop sold never exceeds the shop's number", () => {
  const events = [1, 2, 3, 4].flatMap(id =>
    diffSnapshots(snap({ listingId: id }), later({ listingId: id, quantity: 18 })));
  const out = salesLinked(events, 3, 80);
  assert.equal(out.linked.reduce((n, row) => n + row.units, 0), 3);
});

test("a listing that vanished is resolved, not assumed sold", () => {
  /* Gone from the active response means sold out, deactivated, expired or
     deleted. Calling a deactivation a sale is the most damaging mistake this
     system could make, so the missing ids are read directly. */
  assert.match(inspector, /A LISTING THAT VANISHED IS A QUESTION, NOT AN ANSWER/);
  assert.match(inspector, /const missing = known/);
  assert.match(inspector, /readListings\(missing/);
  assert.match(inspector, /markMissing\(/);
});

test("selling out and being deactivated produce different events", () => {
  const soldOut = diffSnapshots(snap({ quantity: 1 }), later({ quantity: 0, state: "sold_out" }));
  const off = diffSnapshots(snap(), later({ state: "inactive" }));
  assert.ok(soldOut.some(event => event.type === "listing_sold_out"));
  assert.ok(off.some(event => event.type === "listing_became_inactive"));
  /* And only the first is ever sales-linked. */
  assert.equal(salesLinked(off, 1, 40).linked.length, 0);
});

test("a newly discovered listing is baselined without inventing a sale", () => {
  assert.match(inspector, /A FIRST LOOK IS A BASELINE, NEVER A MOVEMENT/);
  assert.match(inspector, /baselinesEstablished \+= 1;/);
  /* And enumeration writes rows without ever writing an event. */
  assert.doesNotMatch(baseline, /writeEvents|writeSalesActivity/);
});

test("a quantity reset is an increase, and never a sale", () => {
  const events = diffSnapshots(snap({ quantity: 3 }), later({ quantity: 999 }));
  assert.ok(events.some(event => event.type === "aggregate_quantity_increased"));
  assert.deepEqual(salesLinked(events, 4, 40).linked, []);
});

test("the baseline is committed only after the result is safe", () => {
  /* Writing the new snapshots first would destroy the comparison point if
     anything after it failed, and the interval would be unrecoverable. */
  const closeAt = inspector.indexOf("await closeInterval(");
  const writeAt = inspector.indexOf("await writeSnapshots(seen)");
  assert.ok(closeAt > 0 && writeAt > closeAt, "snapshots must be written last");
  assert.match(inspector, /THE BASELINE MOVES ONLY AFTER THE RESULT IS SAFE/);
});

test("two workers cannot claim the same interval or run the same pass", () => {
  assert.match(store, /ON CONFLICT\(interval_id\) DO NOTHING/);
  assert.match(inspector, /claimLock\("triggered-inspection"/);
  assert.match(store, /WHERE market_locks\.expires_at < \?/);
});

test("attribution is kept even when no member's niche matches", () => {
  /* Detection and relevance are separate. Restricting the inspector to
     listings already matched to a watch would recreate the coverage hole this
     whole exercise exists to close. */
  assert.doesNotMatch(inspector, /saved_watch|watch_id|niche/i);
  assert.match(inspector, /THE WHOLE SHOP, not the handful of listings/);
});

test("raw and eligible coverage are both reported, from different denominators", () => {
  assert.match(health, /rawCoveragePercent/);
  assert.match(health, /eligibleCoveragePercent/);
  assert.match(health, /preBaselineUnresolved/);
  assert.match(health, /postBaselineUnresolved/);
  /* Eligibility is decided by whether the shop was known before the interval
     began, not by whether the answer came out well. */
  assert.match(inspector, /baselineCompleteBefore\(interval\.shop_id, interval\.from_observed\)/);
  assert.match(baseline, /completed_at = COALESCE\(shop_baselines\.completed_at/);
});

test("the backfill yields to every other Etsy workload", () => {
  assert.match(baseline, /BACKFILL_RESERVE/);
  assert.match(baseline, /No room left under the daily reserve/);
  /* And it reads the shared meter, not this feature's own tally. */
  assert.match(baseline, /FROM etsy_api_usage_buckets/);
});

test("enumeration stays cheap, and enrichment waits for a reason", () => {
  /* Asking for price, favourites and views on every listing in every selling
     shop would cost more than the entire sensor. */
  assert.match(inspector, /priceCents: null/);
  assert.match(inspector, /detection does not need them/);
});

test("only shops already monitored are enumerated", () => {
  assert.match(baseline, /FROM sold_watch WHERE shop_id IS NOT NULL/);
  assert.match(baseline, /NO NEW SHOPS/);
});
