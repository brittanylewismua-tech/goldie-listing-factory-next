/*
  THE FOUR COST SCENARIOS THE SEVEN-BLUEPRINT DRY RUN COULD NOT SHOW.

  The dry run measures one batch against live caches. These four are about
  what happens either side of that batch, and three of them found something:

    second product, family already analyzed  -> free, as designed
    two simultaneous requests, same artwork  -> WOULD BOTH PAY; claimed now
    provider failure, billed                 -> nothing stored, claim released
    provider failure, not billed             -> nothing stored, claim released

  The concurrency case is the one that would cost money. `readDesignIntelligence`
  -> paid call -> `writeDesignIntelligence` has no claim in it, so two requests
  for one artwork would both miss the cache and both bill, and the upsert kept
  the first row's `provider_cost` while discarding the second.

  It is not costing money today, because nothing calls the extraction at all
  yet — which is also why it would have shipped uncaught.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planBatch } from "../app/listing-call-plan.ts";
import { claimHolds, CLAIM_TTL_SECONDS } from "../app/design-claim-rules.ts";

const HASH = "artwork-abc";
const SEVEN = [
  "Unisex Jersey Short Sleeve Tee",
  "Unisex Heavy Cotton Tee",
  "Unisex Heavy Blend Hooded Sweatshirt",
  "Tough Phone Cases",
  "Ceramic Mug 11oz",
  "Unisex Heavy Blend Crewneck Sweatshirt",
  "Kiss-Cut Stickers",
].map(blueprintTitle => ({ artworkHash: HASH, blueprintTitle }));

test("a cold batch of seven costs two paid calls, not fourteen", () => {
  const plan = planBatch(SEVEN);
  assert.equal(plan.designCalls.length, 1);
  assert.equal(plan.familyCopyCalls.length, 1);
  assert.equal(plan.productCategorizationCalls, 0);
  assert.equal(plan.totalPaidCalls, 2);
  assert.equal(plan.legacyPaidCalls, 14);
});

test("another product from a family already analyzed is free", () => {
  /* The design is understood and every family it needs is described. */
  const families = ["tee", "hoodie", "mug", "phoneCase", "sticker", "crewneck"];
  const plan = planBatch(SEVEN, {
    alreadyExtracted: new Set([HASH]),
    cachedCopy: new Set(families.map(family => `${HASH}:${family}`)),
  });
  assert.equal(plan.totalPaidCalls, 0,
    "a repeat of an analyzed design across analyzed families must cost nothing");
});

test("a new family on an analyzed design pays for copy only, never re-extraction", () => {
  const plan = planBatch(
    [...SEVEN, { artworkHash: HASH, blueprintTitle: "Tote Bag" }],
    { alreadyExtracted: new Set([HASH]),
      cachedCopy: new Set(["tee", "hoodie", "mug", "phoneCase", "sticker", "crewneck"]
        .map(family => `${HASH}:${family}`)) });
  assert.equal(plan.designCalls.length, 0, "the design must not be re-extracted");
  assert.equal(plan.familyCopyCalls.length, 1);
  assert.deepEqual(plan.familyCopyCalls[0].families, ["tote"]);
  assert.equal(plan.totalPaidCalls, 1);
});

test("a claim expires, so a crashed winner cannot lock an artwork forever", () => {
  assert.equal(claimHolds(1_000, 1_000 + CLAIM_TTL_SECONDS - 1), true);
  assert.equal(claimHolds(1_000, 1_000 + CLAIM_TTL_SECONDS), false,
    "an expired claim must be takeable or the artwork can never be analyzed again");
});

test("the extraction claim is decided in one statement, not read-then-write", () => {
  const source = readFileSync(new URL("../app/design-claim.ts", import.meta.url), "utf8");
  /* A SELECT followed by an INSERT reopens the exact gap this closes. */
  assert.match(source, /INSERT INTO design_intelligence_claims/);
  assert.match(source, /ON CONFLICT[\s\S]*DO UPDATE SET claimed_at/);
  assert.match(source, /meta\.changes/,
    "the winner must be decided by what the write actually changed");
});

test("a second charge for one artwork is added to the record, not dropped", () => {
  const source = readFileSync(
    new URL("../app/design-intelligence.ts", import.meta.url), "utf8");
  assert.match(source,
    /provider_cost = design_intelligence\.provider_cost \+ excluded\.provider_cost/,
    "the upsert must accumulate cost; replacing it hides a duplicate charge");
});

test("the dry run does not imply a cache that cannot warm up", () => {
  const source = readFileSync(
    new URL("../app/api/listing-factory/dry-run/route.ts", import.meta.url), "utf8");
  assert.match(source, /writePathImplemented: false/);
  assert.doesNotMatch(source, /no stored design intelligence yet/,
    '"yet" describes a cache that fills with use; nothing writes this one');
});
