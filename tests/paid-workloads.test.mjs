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
  const approved = PAID_WORKLOADS
    .filter(entry => entry.limitStatus === "approved").map(entry => entry.key).sort();
  assert.deepEqual(approved, ["designScannerVision", "referenceIngestion"]);
  /* Temporary limits are in force but are holding numbers, not approvals. */
  assert.ok(enforcedWorkloads().length > approved.length);
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
  assert.equal(listing.limitStatus, "temporary");
});

test("every workload declares a ceiling, a retry policy and a cache policy", () => {
  for (const entry of PAID_WORKLOADS) {
    assert.ok(entry.globalDailyCeiling > 0, `${entry.key} has no ceiling`);
    assert.ok(Number.isInteger(entry.retries), `${entry.key} has no retry policy`);
    assert.ok(entry.cachePolicy.length > 10, `${entry.key} has no cache policy`);
    assert.ok(entry.expectedBehaviour.length > 10, `${entry.key} has no expected behaviour`);
    assert.ok(["documented", "estimated", "measured", "settled", "unknown"]
      .includes(entry.costBasis), `${entry.key} has an unrecognised cost basis`);
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
  assert.match(guard, /state IN \('held', 'settled', 'failed-billed'\)/);
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

test("an unknown-cost workload is capped by request count, not by dollars", () => {
  /* Reserving zero dollars makes a workload look free to the dollar guard. */
  for (const entry of PAID_WORKLOADS)
    if (entry.costBasis === "unknown")
      assert.ok(entry.globalDailyRequests !== null && entry.globalDailyRequests > 0,
        `${entry.key} has an unknown cost and no request ceiling, so it reserves nothing`);
});

test("the live Listing Factory pipeline is capped while its cost is unmeasured", () => {
  const listing = workload("listingIntelligenceVision");
  assert.equal(listing.memberDailyLimit, 50);
  assert.equal(listing.limitStatus, "temporary");
  assert.ok(listing.memberDailyAttempts > listing.memberDailyLimit);
});

test("the approved launch ceilings are the small ones", () => {
  assert.equal(workload("designScannerVision").globalDailyCeiling, 2);
  assert.equal(workload("designScannerVision").memberDailyAttempts, 15);
  assert.equal(workload("referenceIngestion").globalDailyCeiling, 0.25);
  assert.equal(workload("referenceIngestion").globalDailyRequests, 100);
});

test("the two reference allowances are coherent, and the dollar one is decisive", () => {
  const reference = workload("referenceIngestion");
  /* 100 images at the estimated cost must FIT the ceiling, or the stated
     image allowance would be unreachable in practice. */
  const fullDay = reference.unitCost * reference.globalDailyRequests;
  assert.ok(fullDay <= reference.globalDailyCeiling,
    `100 images would cost ${fullDay.toFixed(2)} against a ${reference.globalDailyCeiling} ceiling`);
  /* And if real cost comes in higher than estimated, the dollars stop it
     first - the guard checks the ceiling last, after the request count. */
  const guard = readFileSync(new URL("../app/spend-guard.ts", import.meta.url), "utf8");
  assert.ok(guard.indexOf('reason: "global-requests"') < guard.indexOf('reason: "global-ceiling"'),
    "the dollar ceiling must be the last and decisive check");
});

test("a documented price is not labelled as something we measured", () => {
  const images = workload("imageTransformation");
  assert.equal(images.costBasis, "documented");
});

test("a failed but billable call pays the ledger and refunds the member", () => {
  const guard = readFileSync(new URL("../app/spend-guard.ts", import.meta.url), "utf8");
  assert.match(guard, /failed-billed/);
  /* Billable failures must count toward the dollar ceiling. */
  assert.match(guard, /state IN \('held', 'settled', 'failed-billed'\)/);
  /* And must never count as a successful scan. */
  const usage = guard.slice(guard.indexOf("export async function memberUsage"));
  assert.match(usage, /consumes_allowance = 1 AND state = 'settled'/);
  /* Attempts count both. */
  assert.match(usage, /state IN \('settled', 'failed-billed'\)/);
});

test("fal usage is stored, not logged to a console nobody can query", () => {
  const strip = text => text
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const vision = strip(readFileSync(new URL("../app/paid-vision.ts", import.meta.url), "utf8"));
  /* The store is injected rather than imported, so the wiring is what proves
     usage actually lands somewhere queryable. */
  assert.match(vision, /falUsageRecorder/);
  assert.doesNotMatch(vision, /console\.info/);
  assert.match(vision, /fal_usage_recorder_not_wired/);
  const route = strip(readFileSync(new URL(
    "../app/api/listing-intelligence/route.ts", import.meta.url), "utf8"));
  assert.match(route, /setFalUsageRecorder\(recordFalUsage\)/,
    "the live paid pipeline does not wire its usage store");
  const store = strip(readFileSync(new URL("../app/fal-usage.ts", import.meta.url), "utf8"));
  /* Cost and size only. Never the artwork, the prompt or the member. */
  assert.doesNotMatch(store, /prompt|image|user_id/i);
  assert.match(store, /enoughToQuote/);
});
