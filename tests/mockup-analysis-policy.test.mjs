/*
  The seven production cases, exercised rather than grepped.

  A tiny in-memory store stands in for D1 with the same compare-and-set
  semantics, so "two simultaneous requests create one provider call" is
  actually run instead of being inferred from a SQL string.
*/
import test from "node:test";
import assert from "node:assert/strict";
import {
  decide, stillOwns, settleFailure, reopen, nextAttemptAt,
  MAX_ATTEMPTS, LEASE_SECONDS,
} from "../app/mockup-analysis-policy.ts";

const fresh = (over = {}) => ({
  state: "failed", payload: null, generation: 0, leaseExpires: 0,
  attempts: 0, nextAttemptAt: 0, lastFailure: "", reopenedBy: "", ...over,
});

/* One row, one atomic claim — the store only lets a claim through if the
   generation it is replacing is the one it read. */
class Store {
  constructor() { this.row = null; this.providerCalls = 0; }
  claim(now) {
    const decision = decide(this.row, now);
    if (decision.action !== "call") return decision;
    if ((this.row?.generation ?? 0) + 1 !== decision.generation) return { action: "pending", because: "raced" };
    this.row = fresh({
      ...this.row, state: "running", generation: decision.generation,
      leaseExpires: decision.leaseExpires, attempts: decision.attempt,
    });
    this.providerCalls += 1;
    return decision;
  }
  finish(generation, payload) {
    if (!stillOwns(this.row, generation)) return false;
    this.row = { ...this.row, state: "ready", payload, leaseExpires: 0 };
    return true;
  }
  fail(generation, { billed, now, random = () => 0.5 }) {
    if (!stillOwns(this.row, generation)) return null;
    const settlement = settleFailure({ attempts: this.row.attempts, billed });
    this.row = {
      ...this.row, state: settlement.nextState, leaseExpires: 0,
      lastFailure: "provider error",
      nextAttemptAt: settlement.nextState === "failed"
        ? nextAttemptAt(this.row.attempts, now, random) : 0,
    };
    return settlement;
  }
}

test("1. two simultaneous identical requests create one provider call", () => {
  const store = new Store();
  const first = store.claim(1_000);
  const second = store.claim(1_000);
  assert.equal(first.action, "call");
  assert.equal(second.action, "pending", "a second provider call was started");
  assert.equal(store.providerCalls, 1);
});

test("2. a billed failure charges the ledger, refunds the member, and waits", () => {
  const store = new Store();
  const claim = store.claim(1_000);
  const settlement = store.fail(claim.generation, { billed: 0.004, now: 1_000 });
  assert.equal(settlement.ledger, "settle", "billable tokens were not charged");
  assert.equal(settlement.refundMemberAllowance, true);
  assert.equal(store.row.state, "failed");
  assert.ok(store.row.nextAttemptAt > 1_000, "an immediate retry was allowed");
});

test("3. an unbilled failure releases the reservation and still waits", () => {
  const store = new Store();
  const claim = store.claim(1_000);
  const settlement = store.fail(claim.generation, { billed: 0, now: 1_000 });
  assert.equal(settlement.ledger, "release");
  assert.equal(settlement.refundMemberAllowance, true);
  assert.ok(store.row.nextAttemptAt > 1_000);
});

test("4. repeated requests during backoff create zero provider calls", () => {
  const store = new Store();
  const claim = store.claim(1_000);
  store.fail(claim.generation, { billed: 0.004, now: 1_000 });
  const before = store.providerCalls;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const decision = store.claim(1_005);
    assert.equal(decision.action, "backoff");
  }
  assert.equal(store.providerCalls, before, "an outage was retried in a loop");
  /* And it does become eligible once the wait has passed. */
  assert.equal(store.claim(store.row.nextAttemptAt + 1).action, "call");
});

test("5. a late worker cannot overwrite the result of the worker that took over", () => {
  const store = new Store();
  const stale = store.claim(1_000);
  /* Its lease expires and a second worker reclaims the row. */
  const taken = store.claim(1_000 + LEASE_SECONDS + 1);
  assert.equal(taken.action, "call");
  assert.notEqual(taken.generation, stale.generation);
  assert.ok(store.finish(taken.generation, { good: true }));
  /* The original worker returns late. */
  assert.equal(store.finish(stale.generation, { stale: true }), false,
    "a late worker overwrote a newer result");
  assert.deepEqual(store.row.payload, { good: true });
});

test("6. terminal failure stays visible and does not restart on its own", () => {
  const store = new Store();
  let now = 1_000;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const decision = store.claim(now);
    assert.equal(decision.action, "call", `attempt ${attempt + 1} was not allowed`);
    store.fail(decision.generation, { billed: 0.004, now });
    now = (store.row.nextAttemptAt || now) + 1;
  }
  assert.equal(store.row.state, "terminal");
  const calls = store.providerCalls;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const decision = store.claim(now + attempt * 10_000);
    assert.equal(decision.action, "terminal");
    assert.match(decision.because, /stopped|ceiling/);
  }
  assert.equal(store.providerCalls, calls, "a terminal failure restarted itself");
  assert.equal(store.providerCalls, MAX_ATTEMPTS, "the attempt ceiling was exceeded");
});

test("7. an explicit retry reopens it once and records who did it", () => {
  const store = new Store();
  let now = 1_000;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const decision = store.claim(now);
    store.fail(decision.generation, { billed: 0, now });
    now = (store.row.nextAttemptAt || now) + 1;
  }
  assert.equal(store.row.state, "terminal");

  store.row = reopen(store.row, "owner:brittany", now);
  assert.equal(store.row.reopenedBy, "owner:brittany");
  const allowed = store.claim(now);
  assert.equal(allowed.action, "call", "an explicit retry did not reopen the work");

  /* Exactly one more attempt: failing again returns it to terminal rather
     than granting a fresh set of four. */
  store.fail(allowed.generation, { billed: 0, now });
  assert.equal(store.row.state, "terminal");
});

test("backoff is jittered so an outage does not end in a thundering herd", () => {
  const low = nextAttemptAt(1, 0, () => 0);
  const high = nextAttemptAt(1, 0, () => 1);
  assert.notEqual(low, high, "backoff has no jitter");
  assert.ok(high > low);
  /* And it lengthens with each attempt. */
  assert.ok(nextAttemptAt(3, 0, () => 0.5) > nextAttemptAt(1, 0, () => 0.5));
});

test("a duplicate is told to poll rather than held open for the lease", () => {
  const store = new Store();
  store.claim(1_000);
  const duplicate = store.claim(1_001);
  assert.equal(duplicate.action, "pending");
  assert.match(duplicate.because, /already being analyzed/);
});
