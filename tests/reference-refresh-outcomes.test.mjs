/*
  CASE 14 AND CASE 15 — what happens to a reference that went stale.

  Etsy requires displayed listing information to be no more than six hours
  old, so a stale reference is re-read before it is allowed to back a claim.
  Three things can come back, and each has to be handled differently:

    the listing is gone            -> it leaves the cohort
    the listing is no longer live  -> it leaves the cohort
    the IMAGE changed              -> it leaves the cohort

  The third is the subtle one. A changed image is a different design, so the
  analysis we hold no longer describes what is selling. Keeping it would let a
  member's design be compared against artwork nobody has ever looked at, and
  the comparison would look exactly as confident as a real one.

  These are fixtures. The live run reports whichever of these occurred
  naturally in the cohort; it cannot be made to occur on demand without
  writing false image ids into production reference data.
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const scan = readFileSync(new URL("../app/api/design-scanner/scan/route.ts",
  import.meta.url), "utf8");
const refresh = scan.slice(scan.indexOf("/* ------------------------------------------------------------- refresh */"),
  scan.indexOf("/* Analyses we already hold."));

test("a stale reference is re-read before it may back a claim", () => {
  assert.match(refresh, /!isFresh\(Number\(row\.retrievedAt\), now\)/);
  assert.match(refresh, /listings\/batch/,
    "the refresh is one batched call, not one per reference");
  assert.match(refresh, /includes=Images/,
    "without the images the changed-image check cannot be made at all");
});

test("a reference whose image changed leaves the cohort", () => {
  assert.match(refresh, /Number\(answer\.imageId\) !== Number\(existing\.imageId\)/);
  assert.match(refresh, /existing\.outcome = "image-changed"/);
  assert.match(refresh, /dropped\.imageChanged \+= 1/);
  /* It must not be quietly kept with its old analysis. */
  const branch = refresh.slice(refresh.indexOf("A changed image is a different design"));
  assert.match(branch.slice(0, 400), /continue;/,
    "the changed reference must not fall through to the update below it");
});

test("a reference that is gone or no longer live also leaves", () => {
  assert.match(refresh, /existing\.outcome = "gone"/);
  assert.match(refresh, /dropped\[answer \? "inactive" : "gone"\] \+= 1/,
    "gone and inactive are different facts and are counted separately");
});

test("only recovered references survive the refresh", () => {
  assert.match(scan, /cohortRows = cohortRows\.filter\(row => row\.outcome === "recovered"\)/,
    "anything not explicitly recovered must be excluded, so a new outcome "
    + "added later cannot silently stay in the cohort");
});

test("a refresh that fails drops those references rather than trusting them", () => {
  assert.match(refresh, /A refresh we could not complete drops those references/);
  /* A non-ok response continues without marking them recovered, so the
     filter above removes them. */
  assert.match(refresh, /if \(!response\.ok\) continue;/);
});

test("the member's result reports what the refresh cost and dropped", () => {
  assert.match(scan, /etsyRefreshCalls: etsyCalls, droppedOnRefresh: dropped/,
    "a cohort that shrank during the scan is part of what the result means");
});

test("refreshing references is never charged to the member's scan allowance", () => {
  /* The Etsy refresh sits after the reservation and costs Etsy calls, not
     provider spend. A member must not lose a scan because references aged. */
  const reserveAt = scan.indexOf("await reserveSpend");
  const refreshAt = scan.indexOf("const staleIds = cohortRows");
  assert.ok(reserveAt > -1 && refreshAt > reserveAt,
    "the refresh runs inside a scan already paid for, not as its own charge");
  assert.doesNotMatch(refresh, /reserveSpend|settleSpend/);
});

/* ------------------------------------------------ the production-path canary */

test("the canary never writes to Etsy", () => {
  const canary = readFileSync(new URL(
    "../app/api/design-scanner/reference-change-canary/route.ts",
    import.meta.url), "utf8");
  assert.doesNotMatch(canary, /openapi\.etsy\.com/,
    "it makes our own cache disagree with Etsy; it must not touch Etsy");
  /* The only tables it writes are our cache of Etsy's data. */
  const writes = [...canary.matchAll(/UPDATE (\w+)|INSERT INTO (\w+)|DELETE FROM (\w+)/g)]
    .map(match => match[1] ?? match[2] ?? match[3]);
  assert.deepEqual([...new Set(writes)], ["reference_images"],
    `the canary writes to ${[...new Set(writes)].join(", ")}`);
});

test("the canary restores the row on every path", () => {
  const canary = readFileSync(new URL(
    "../app/api/design-scanner/reference-change-canary/route.ts",
    import.meta.url), "utf8");
  assert.match(canary, /\} finally \{/,
    "a canary that leaves the cache wrong is worse than no canary");
  assert.match(canary, /if \(!restored\)/,
    "the finally must not undo a restore that already happened");
  /* And it verifies the restore rather than assuming it. */
  assert.match(canary, /restored: Number\(check\?\.image_id\) === originalImageId/);
  assert.match(canary, /Number\(check\?\.retrieved_at\) === Number\(target\.retrieved_at\)/);
});

test("the canary costs nothing, and refuses if it would", () => {
  const canary = readFileSync(new URL(
    "../app/api/design-scanner/reference-change-canary/route.ts",
    import.meta.url), "utf8");
  assert.match(canary, /FROM scan_uploads WHERE user_id = \? AND artwork_hash = \?/,
    "a cold design would pay for a provider call and prove the opposite");
  assert.match(canary, /only meaningful on a warm design/);
  assert.match(canary, /noProviderSpend: Number\(after\.body\.paidCalls \?\? -1\) === 0/);
});

test("the canary states its four proofs separately", () => {
  const canary = readFileSync(new URL(
    "../app/api/design-scanner/reference-change-canary/route.ts",
    import.meta.url), "utf8");
  for (const proof of ["oldAnalysisRejected", "changedImageDidNotInheritEvidence",
    "cohortRecalculated", "noProviderSpend"])
    assert.ok(canary.includes(proof), `missing proof: ${proof}`);
  /* A single boolean would let a partial result read as a pass. */
  assert.match(canary, /so a partial result cannot read as a pass/);
  assert.match(canary,
    /cohortRecalculated: listingsAfter === listingsBefore - imageChanged/,
    "the cohort must shrink by exactly the number dropped, not merely shrink");
});

test("the canary is owner-only", () => {
  const canary = readFileSync(new URL(
    "../app/api/design-scanner/reference-change-canary/route.ts",
    import.meta.url), "utf8");
  assert.match(canary, /if \(!user \|\| !isOwner\(user\)\)/);
  const matrix = readFileSync(new URL("../app/access-matrix.ts", import.meta.url), "utf8");
  assert.ok(matrix.includes('"/api/design-scanner/reference-change-canary"'));
});

test("the canary picks a reference from the scanned niche's own cohort", () => {
  const canary = readFileSync(new URL(
    "../app/api/design-scanner/reference-change-canary/route.ts",
    import.meta.url), "utf8");
  /*
    The refresh only re-reads references inside the scanned niche's cohort. A
    target picked globally would be left untouched, the branch would never
    fire, and all four proofs would read false — which would look like a
    defect in the product rather than in the canary's aim.
  */
  assert.match(canary, /JOIN \(SELECT DISTINCT listing_id FROM listing_sales_activity/,
    "cohort membership requires momentum evidence");
  assert.match(canary, /r\.title LIKE \? OR r\.tags LIKE \?/,
    "and the niche's wording in the reference's own title or tags");
  assert.match(canary, /const \{ terms \} = normalizeNiche\(niche\)/,
    "the terms must come from the same function the scan uses, or this drifts "
    + "from the real matcher");
  /* A miss is reported as a canary problem, not a product one. */
  assert.match(canary, /pickLandedInCohort: imageChanged >= 1/);
});
