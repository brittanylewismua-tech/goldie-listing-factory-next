/*
  The correlation worker replaces an Etsy call with a join. Everything that
  made the old attribution honest has to survive that change.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  correlate, timingFor, eventsInWindow, CORRELATION_RULE_VERSION,
  EARLIEST_CORRELATION_SECONDS, MAX_EVIDENCE_AGE_SECONDS, IMPLAUSIBLE_DROP,
} from "../app/correlation.ts";

const NOW = 1_800_000_000;
const interval = (over = {}) => ({ id: 1, shopId: 10, soldDelta: 1,
  fromObserved: NOW - 1_200, toObserved: NOW - 600, ...over });
const event = (over = {}) => ({ id: 1, listingId: 100, shopId: 10,
  type: "aggregate_quantity_decreased", delta: -1,
  observedAt: NOW - 700, previousObservedAt: NOW - 1_300, ...over });

/* ------------------------------------------------------------- timing */

test("an interval is not correlated before a sweep could have seen it", () => {
  const fresh = interval({ toObserved: NOW - 60 });
  const timing = timingFor(fresh, NOW);
  assert.equal(timing.state, "too-early");
  assert.equal(timing.readyAt, fresh.toObserved + EARLIEST_CORRELATION_SECONDS);
});

test("an interval past the useful window expires rather than being guessed at", () => {
  const old = interval({ toObserved: NOW - MAX_EVIDENCE_AGE_SECONDS - 10 });
  const timing = timingFor(old, NOW);
  assert.equal(timing.state, "expired");
  assert.ok(timing.ageSeconds > MAX_EVIDENCE_AGE_SECONDS);
});

test("an interval inside the window is ready", () => {
  assert.equal(timingFor(interval({ toObserved: NOW - 1_500 }), NOW).state, "ready");
});

/* -------------------------------------------------------- the window */

test("only events whose reading pair overlaps the interval are considered", () => {
  const inside = event();
  const after = event({ id: 2, observedAt: NOW + 5_000, previousObservedAt: NOW + 4_000 });
  const before = event({ id: 3, observedAt: NOW - 9_000, previousObservedAt: NOW - 10_000 });
  const picked = eventsInWindow(interval(), [inside, after, before]).map(row => row.id);
  assert.deepEqual(picked, [1]);
});

test("another shop's events never enter this shop's interval", () => {
  assert.deepEqual(eventsInWindow(interval(), [event({ shopId: 99 })]), []);
});

/* --------------------------------------------------------- the rules */

test("no shop increase means no sale, whatever the listings did", () => {
  const result = correlate(interval({ soldDelta: 0 }), [event()], 50);
  assert.equal(result.attributedUnits, 0);
  assert.equal(result.unresolvedUnits, 0);
  assert.match(result.because, /counter did not move/);
});

test("the shop's own increase is a hard cap", () => {
  const events = [event({ id: 1, listingId: 100, delta: -5 }),
    event({ id: 2, listingId: 200, delta: -5 })];
  const result = correlate(interval({ soldDelta: 3 }), events, 50);
  assert.equal(result.attributedUnits, 3, "more units were attributed than the shop sold");
  assert.equal(result.unresolvedUnits, 0);
});

test("unmatched shop sales stay unresolved and are never spread", () => {
  const result = correlate(interval({ soldDelta: 7 }), [event({ delta: -1 })], 50);
  assert.equal(result.attributedUnits, 1);
  assert.equal(result.unresolvedUnits, 6);
  assert.equal(result.attributions.length, 1, "a second listing was invented");
});

test("every attribution records the events behind it", () => {
  const result = correlate(interval({ soldDelta: 2 }), [event({ id: 42 })], 50);
  assert.deepEqual(result.attributions[0].eventIds, [42]);
});

test("selling out and dropping stock is one sale, not two", () => {
  const events = [
    event({ id: 1, listingId: 100, type: "aggregate_quantity_decreased", delta: -1 }),
    event({ id: 2, listingId: 100, type: "listing_sold_out", delta: null }),
  ];
  const result = correlate(interval({ soldDelta: 5 }), events, 50);
  assert.equal(result.attributedUnits, 1);
  assert.equal(result.attributions[0].reason, "quantity_fell",
    "the count-carrying evidence did not win");
});

test("two readings of the same change are one claim with two pieces of evidence", () => {
  const events = [event({ id: 1, listingId: 100, delta: -1 }),
    event({ id: 2, listingId: 100, delta: -1 })];
  const result = correlate(interval({ soldDelta: 4 }), events, 50);
  assert.equal(result.attributions.length, 1);
  assert.deepEqual(result.attributions[0].eventIds.sort(), [1, 2]);
});

test("a listing edited in the same window is never read as a sale", () => {
  const events = [event({ id: 1, listingId: 100, delta: -3 }),
    event({ id: 2, listingId: 100, type: "listing_edited", delta: null })];
  const result = correlate(interval({ soldDelta: 3 }), events, 50);
  assert.equal(result.attributedUnits, 0);
  assert.equal(result.unresolvedUnits, 3);
});

test("a restock after a drop does not become a second sale", () => {
  const events = [event({ id: 1, listingId: 100, delta: -2 }),
    event({ id: 2, listingId: 100, type: "aggregate_quantity_increased", delta: 5 })];
  const result = correlate(interval({ soldDelta: 2 }), events, 50);
  assert.equal(result.attributedUnits, 2);
  assert.equal(result.attributions.length, 1);
});

test("an implausible drop is inventory management, not a rush", () => {
  const result = correlate(interval({ soldDelta: 30 }),
    [event({ delta: -(IMPLAUSIBLE_DROP + 1) })], 50);
  assert.equal(result.attributedUnits, 0);
});

test("a bulk edit is refused rather than attributed", () => {
  const events = Array.from({ length: 30 }, (unused, index) =>
    event({ id: index + 1, listingId: 100 + index, delta: -1 }));
  const result = correlate(interval({ soldDelta: 30 }), events, 40);
  assert.equal(result.conflicted, true);
  assert.equal(result.attributedUnits, 0);
  assert.match(result.because, /too many listings moved at once/);
});

test("the same inputs always produce the same attribution", () => {
  const events = [event({ id: 1, listingId: 300, delta: -2 }),
    event({ id: 2, listingId: 100, delta: -2 }),
    event({ id: 3, listingId: 200, delta: -1 })];
  const first = correlate(interval({ soldDelta: 3 }), events, 50);
  const second = correlate(interval({ soldDelta: 3 }), [...events].reverse(), 50);
  assert.deepEqual(first.attributions, second.attributions);
  /* Ties break on the lower listing id, never on order of arrival. */
  assert.equal(first.attributions[0].listingId, 100);
});

test("correlation needs no Etsy call", () => {
  const code = readFileSync(new URL("../app/correlation.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  for (const banned of ["fetch(", "etsy", "openapi", "waitForEtsyCapacity"])
    assert.ok(!code.toLowerCase().includes(banned.toLowerCase()),
      `correlation reaches for ${banned}`);
});

test("the rule version is recorded so results can be recomputed", () => {
  assert.equal(typeof CORRELATION_RULE_VERSION, "number");
});

test("no query binds an unbounded number of shop ids", () => {
  /* D1 caps bound variables. A batch of 1,500 intervals spans more shops than
     the cap, and binding them all produced "too many SQL variables". */
  const worker = readFileSync(
    new URL("../app/correlation-worker.ts", import.meta.url), "utf8");
  assert.match(worker, /const CHUNK = \d+;/);
  assert.match(worker, /for \(let index = 0; index < shops\.length; index \+= CHUNK\)/);
  const chunk = Number(worker.match(/const CHUNK = (\d+);/)[1]);
  assert.ok(chunk <= 90, `a chunk of ${chunk} shop ids is near the variable cap`);
});

test("expired intervals are closed in one statement, not one slot per batch", () => {
  const worker = readFileSync(
    new URL("../app/correlation-worker.ts", import.meta.url), "utf8");
  assert.match(worker, /SET correlated_at = \?, correlation_state = 'expired'\n\s+WHERE correlated_at IS NULL AND to_observed < \?/);
});

test("the pass selects intervals that are ready, not merely recent", () => {
  /* Ordering newest-first and filtering afterwards produced 200 considered,
     200 too early, 0 correlated — forever. */
  const worker = readFileSync(
    new URL("../app/correlation-worker.ts", import.meta.url), "utf8");
  assert.match(worker, /AND to_observed <= \?/);
  assert.match(worker, /SELECT WHAT IS ACTUALLY READY, NOT THE NEWEST/);
});

test("the lock is released even when a pass throws", () => {
  const worker = readFileSync(
    new URL("../app/correlation-worker.ts", import.meta.url), "utf8");
  assert.match(worker, /\} finally \{[\s\S]{0,200}releaseLock\("correlation", holder\)/);
});
