/*
  THE LAYERED FLOW, CONNECTED TO THINGS THAT COST MONEY.

  Until this landed the two-call architecture existed as a planner and a dry
  run: the plan said two calls where the legacy path made fourteen, and
  nothing in the product performed either of them. The saving was a fact about
  an arithmetic function, not about production.

  What has to be true of the real path, asserted here against the source
  because the guarantees are structural — an ordering and a set of writes —
  rather than observable from any one response.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leaseHolds, LEASE_TTL_SECONDS } from "../app/work-lease-rules.ts";

const read = name => readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8");
const flow = read("listing-flow.ts");
const route = read("api/listing-factory/prepare/route.ts");
const lease = read("work-lease.ts");
const store = read("family-copy-store.ts");

test("the cache is read before anything is leased or paid for", () => {
  const readAt = flow.indexOf("readDesignIntelligence(userId, artworkHash)");
  const leaseAt = flow.indexOf('acquireLease("design-intelligence"');
  const payAt = flow.indexOf('workloadKey: "listingIntelligenceVision"');
  assert.ok(readAt > 0 && leaseAt > readAt && payAt > leaseAt,
    "the order must be read, then lease, then pay — a lease before a cache read "
    + "serialises free work, and a payment before a lease is the duplicate charge");
});

test("the lease is taken before the provider is contacted", () => {
  const leaseAt = flow.indexOf('acquireLease("design-intelligence"');
  const fetchAt = flow.indexOf("https://fal.run/openrouter/router/vision");
  assert.ok(leaseAt > 0 && fetchAt > leaseAt,
    "two simultaneous requests must produce one provider call");
});

test("family copy is leased on the missing set, not the whole batch", () => {
  const leaseKey = flow.slice(flow.indexOf("const leaseKey = [userId, artworkHash"),
    flow.indexOf('const lease = await acquireLease("family-copy"'));
  assert.match(leaseKey, /missing\.join\("\+"\)/,
    "leasing the wanted set would serialise two batches that need different families");
  assert.match(leaseKey, /DESIGN_VERSION/,
    "re-extracting a design must not leave its copy described by old wording");
});

test("one text-only call covers every missing family", () => {
  const copyCall = flow.slice(flow.indexOf("const prompt ="),
    flow.indexOf("const parsed = parseFamilyCopy"));
  assert.doesNotMatch(copyCall, /image_urls/,
    "the copy call must carry no image; everything it knows is in the stored design");
  assert.match(copyCall, /missing\.map\(family =>/,
    "every missing family must be covered by the one call");
});

test("each family is stored on its own row", () => {
  assert.match(store, /PRIMARY KEY \(user_id, artwork_hash, design_version, family/,
    "storing a call's response whole would stop a later batch reusing one family");
});

test("a stale worker cannot overwrite a newer result", () => {
  for (const [what, before] of [
    ["design", flow.indexOf('stillHolds("design-intelligence"')],
    ["copy", flow.indexOf('stillHolds("family-copy"')]]) {
    assert.ok(before > 0, `${what} does not check its lease before writing`);
  }
  const designWrite = flow.indexOf("await writeDesignIntelligence(userId, artworkHash, design, billed)");
  const designCheck = flow.indexOf('stillHolds("design-intelligence"');
  assert.ok(designCheck < designWrite,
    "the lease check must come before the write, or the overwrite already happened");
  const copyWrite = flow.indexOf("await writeFamilyCopy(");
  const copyCheck = flow.indexOf('stillHolds("family-copy"');
  assert.ok(copyCheck < copyWrite, "same for copy");
  assert.match(lease, /DELETE FROM work_leases WHERE kind = \? AND lease_key = \? AND token = \?/,
    "a release must not undo somebody else's takeover");
});

test("a billed call is never lost from accounting, even when its result is dropped", () => {
  /* Both stale-worker branches settle the money before discarding the answer:
     the call was made and the provider billed for it either way. */
  const staleDesign = flow.slice(flow.indexOf('if (!await stillHolds("design-intelligence"'),
    flow.indexOf("await writeDesignIntelligence("));
  assert.match(staleDesign, /settleSpend\(reservation\.id, billed\)/);
  assert.match(staleDesign, /recordFalUsage/);
  const staleCopy = flow.slice(flow.indexOf('if (!await stillHolds("family-copy"'),
    flow.indexOf("await writeFamilyCopy("));
  assert.match(staleCopy, /settleSpend\(reservation\.id, billed\)/);
  assert.match(staleCopy, /recordFalUsage/);
});

test("a member is refunded for Goldie's failure while billable usage still settles", () => {
  /* `failSpend` refunds the allowance always and keeps the dollars whenever
     the provider reported billable usage. Both failure paths use it. */
  assert.equal((flow.match(/failSpend\(reservation\.id, \{ billed \}\)/g) || []).length, 2,
    "both the design and copy failure paths must refund the member and settle the dollars");
  const guard = read("spend-guard.ts");
  assert.match(guard, /const state = billed > 0 \? "failed-billed" : "released"/);
});

test("every paid call goes through the spend guard", () => {
  const calls = (flow.match(/await fetch\("https:\/\/fal\.run/g) || []).length;
  const reservations = (flow.match(/await reserveSpend\(/g) || []).length;
  assert.equal(calls, reservations,
    `${calls} provider calls and ${reservations} reservations — every call needs a door`);
});

test("the provider's real cost is read, not assumed", () => {
  assert.match(flow, /usage\.cost/);
  assert.doesNotMatch(flow, /billed = reservation\.reservedCost/,
    "settling with the estimate defeats the point of settling");
});

test("categories cost nothing by construction", () => {
  assert.match(route, /categoryCalls: 0/);
  /* The category is read off the classification, which is a table lookup. */
  assert.match(route, /category: entry\.classification\.category/);
  /* The design prompt does mention a category — to forbid inferring one. The
     product is not in the artwork, and a model asked to guess will guess. */
  assert.match(flow, /never infer a product, a garment, a category or a department/);
  const design = flow.slice(flow.indexOf("const DESIGN_PROMPT"), flow.indexOf("function readDesign"));
  /* `illustrationCategory` is the artwork's own style and is fine. What must
     never be asked for is the Etsy product category or taxonomy node. */
  assert.doesNotMatch(design, /"(product_?)?category"|taxonomy/i,
    "the design prompt must not ask a model for the Etsy category");
});

test("the production path stops before Etsy", () => {
  assert.match(route, /wroteToEtsy: false, createdDraft: false, createdPrintifyProduct: false/);
  /*
    Scoped to the POST handler. The route also carries an owner-only GET that
    READS one of the member's own listing images to measure the flow against —
    a read is not the thing being guarded here, a write is.
  */
  const post = route.slice(route.indexOf("export const POST"), route.indexOf("export const GET"));
  assert.ok(post.length > 500, "the POST handler was not found");
  for (const call of ["/listings", "createDraft", "publishListing", "fal.run"])
    assert.ok(!post.includes(call), `the prepare POST reaches ${call} directly`);
  for (const verb of ['method: "POST"', 'method: "PUT"', 'method: "DELETE"'])
    assert.ok(!post.includes(verb), `the prepare POST issues a ${verb} of its own`);
  /*
    And the owner-only GET changes nothing of the member's. It POSTs to a
    provider when probing which text endpoint answers — that is a request to
    a model, not a write to her shop — so what is guarded is the shops.
  */
  const get = route.slice(route.indexOf("export const GET"));
  for (const host of ["etsy.com", "printify.com", "etsyFetch", "/listings"])
    assert.ok(!get.includes(host), `the owner endpoint reaches ${host}`);
  assert.match(get, /isOwner\(user\)/, "the owner endpoint must be owner-gated");
  assert.match(get, /artwork_provenance/,
    "the sample must read the member's own stored artwork");
  assert.ok(!get.includes("etsyFetch"),
    "the sample needs no Etsy round trip: the artwork is already stored");
});

test("validateOnly stops before any provider is contacted", () => {
  const gate = route.indexOf("if (body.validateOnly)");
  const design = route.indexOf("await ensureDesign(");
  assert.ok(gate > 0 && gate < design,
    "validation must return before the design layer spends anything");
  assert.match(route, /contactedProvider: false/);
});

test("the flow uses the shared print-on-demand listing fields", () => {
  assert.match(route, /\.\.\.POD_LISTING_FIELDS/);
  assert.ok(!route.includes('"i_did"'));
});

test("one composition module, so a title cannot be built two ways", () => {
  const dry = read("api/listing-factory/dry-run/route.ts");
  for (const [name, source] of [["dry run", dry], ["production", route]])
    assert.match(source, /from "@\/app\/listing-composition"/,
      `the ${name} path composes titles with its own copy`);
  assert.doesNotMatch(dry, /^function composeTitle/m,
    "the dry run still holds a private composition");
});

test("a lease expires, so a crashed winner cannot lock work forever", () => {
  assert.equal(leaseHolds(1000, 1000 + LEASE_TTL_SECONDS - 1), true);
  assert.equal(leaseHolds(1000, 1000 + LEASE_TTL_SECONDS), false);
});

test("a waiter is bounded and never fails the batch on copy", () => {
  /* Design can honestly ask the member to retry. Copy cannot justify failing a
     batch: deterministic copy is correct, free, and already written. */
  const waitBlock = flow.slice(flow.indexOf('const lease = await acquireLease("family-copy"'),
    flow.indexOf("const reservation = await reserveSpend({\n    workloadKey: \"listingFamilyCopy\""));
  assert.match(waitBlock, /fallbackFor\(family\)/,
    "a held copy lease must fall back deterministically rather than fail or double-pay");
});
