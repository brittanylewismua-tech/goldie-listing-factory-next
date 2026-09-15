import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PAID_WORKLOADS, workload, enforcedWorkloads, byPriority } from "../app/paid-workloads.ts";

test("the Design Scanner limit is the approved one", () => {
  const scanner = workload("designScannerVision");
  assert.equal(scanner.memberDailyLimit, 10);
  assert.equal(scanner.limitStatus, "approved");
  assert.equal(scanner.retries, 1, "more than one retry is a second vision call");
});

test("nothing else claims to be approved", () => {
  /* Limits nobody signed off on must not quietly start enforcing. */
  const approved = enforcedWorkloads().map(entry => entry.key).sort();
  assert.deepEqual(approved, ["designScannerVision", "referenceIngestion"]);
});

test("reference ingestion is background and yields to members", () => {
  const reference = workload("referenceIngestion");
  assert.equal(reference.customerFacing, false);
  assert.equal(reference.memberDailyLimit, null, "ingestion must not eat a member's ten scans");
  const scanner = workload("designScannerVision");
  assert.ok(reference.priority > scanner.priority);
  /* 100 images a day at the estimated unit cost. */
  assert.ok(reference.unitCost * 100 <= reference.globalDailyCeiling,
    `100 images costs ${(reference.unitCost * 100).toFixed(2)} against a ${reference.globalDailyCeiling} ceiling`);
});

test("customer work outranks background work whatever its priority number", () => {
  const order = byPriority();
  const lastCustomer = order.map(entry => entry.customerFacing).lastIndexOf(true);
  const firstBackground = order.map(entry => entry.customerFacing).indexOf(false);
  assert.ok(firstBackground > lastCustomer, "a background workload sorted above a customer one");
});

test("the production Listing Factory vision calls are registered", () => {
  /* Found by audit, already billing, previously unmetered. Leaving it out of
     the registry would leave the busiest paid feature uncapped. */
  const listing = workload("listingIntelligenceVision");
  assert.ok(listing, "the live fal.run vision calls are missing from the registry");
  assert.equal(listing.costBasis, "unknown", "an unmeasured cost must not be presented as known");
  assert.equal(listing.limitStatus, "proposed");
});

test("every workload declares a ceiling, a retry policy and a cache policy", () => {
  for (const entry of PAID_WORKLOADS) {
    assert.ok(entry.globalDailyCeiling > 0, `${entry.key} has no ceiling`);
    assert.ok(Number.isInteger(entry.retries), `${entry.key} has no retry policy`);
    assert.ok(entry.cachePolicy.length > 10, `${entry.key} has no cache policy`);
    assert.ok(entry.expectedBehaviour.length > 10, `${entry.key} has no expected behaviour`);
    assert.ok(["measured", "estimated", "unknown"].includes(entry.costBasis));
  }
});

test("an unknown unit cost is never dressed up as a number", () => {
  for (const entry of PAID_WORKLOADS)
    if (entry.costBasis === "unknown")
      assert.equal(entry.unitCost, 0,
        `${entry.key} carries a cost figure it has not measured`);
});

test("the guard reserves before calling and reconciles after", () => {
  const guard = readFileSync(new URL("../app/spend-guard.ts", import.meta.url), "utf8");
  /* Held reservations must count, or simultaneous requests all pass. */
  assert.match(guard, /state IN \('held', 'settled'\)/);
  assert.match(guard, /COALESCE\(actual_cost, reserved_cost\)/);
  /* A failure must not consume the member's allowance. */
  assert.match(guard, /consumes_allowance = 0/);
  assert.match(guard, /state = 'settled'/);
});

test("an unregistered workload cannot spend", () => {
  const guard = readFileSync(new URL("../app/spend-guard.ts", import.meta.url), "utf8");
  assert.match(guard, /reason: "unregistered"/);
});

test("only settled scans count against a member's allowance", () => {
  const guard = readFileSync(new URL("../app/spend-guard.ts", import.meta.url), "utf8");
  const usage = guard.slice(guard.indexOf("export async function memberUsage"));
  assert.match(usage, /consumes_allowance = 1 AND state = 'settled'/);
  /* The member is told when a scan comes back, not just that they are out. */
  assert.match(usage, /oldestLeavesWindowAt/);
});
