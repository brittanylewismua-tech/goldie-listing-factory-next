/*
  A FAILED DRAFT OBJECT IS NOT A DRAFT.

  `draft_count` counted every entry in the client's draft array, including ones
  whose status is "Failed" or "NeedsRetry". A batch whose only creation attempt
  was refused reported `draft_count: 1`, which reads exactly like a successful
  draft.

  That is not cosmetic. It is what sent a manual audit looking through Printify
  for a product that had never been created, and from there at a 24-character
  id taken from the batch thumbnail — which turned out to be a real customer
  product linked to a live Etsy listing. The count being wrong is upstream of
  nearly deleting the wrong thing.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = name => readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8");

test("only a draft Printify actually created is counted", () => {
  const route = read("api/batches/route.ts");
  assert.match(route,
    /draft_count:\(state\.drafts\|\|\[\]\)\.filter\(draft=>draft\?\.status==="Created"&&Boolean\(draft\?\.id\)\)\.length/,
    "a draft counts only when Printify created it and named it");
  /* The attempt count is still available — it is useful, it was just wearing
     the wrong name. */
  assert.match(route, /attempted_draft_count:\(state\.drafts\|\|\[\]\)\.length/);
});

test("a listing that was not created says why", () => {
  const review = read("final-listing-review.tsx");
  const block = review.slice(review.indexOf('draft.status!=="Created"?'),
    review.indexOf("Retry listing</button>"));
  assert.match(block, /draft\.error\|\|/,
    "the reason is on the draft already; a bare Retry button hides it");
  assert.match(block, /recipe-listing-failure/);
  /* Measured on a real attempt: the reason was "Reload the saved product to
     renew this batch connection", and retrying without doing that fails
     identically every time. */
  const css = read("clarity-pass.css");
  assert.match(css, /\.recipe-listing-card \.recipe-listing-failure\{/,
    "the reason needs a visible treatment, not a bare paragraph");
});

test("a product id is never taken from a preview or thumbnail URL", () => {
  /* The near-miss: the batch thumbnail is `images.printify.com/mockup/<id>/…`
     where <id> is the SOURCE TEMPLATE, not the created product. */
  const marker = read("printify-validation-marker.ts");
  assert.match(marker, /INTERNAL_VALIDATION_MARKER/);
  assert.match(marker, /isInternalValidationProduct/);
  const prepare = read("api/listing-factory/prepare/route.ts");
  const removal = prepare
    .slice(prepare.indexOf("async function printifyProduct"),
      prepare.indexOf("async function findInternalTestProducts"))
    /* Comments explain the near-miss and name the thumbnail on purpose; the
       check reads code. */
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.ok(removal.length > 400, "the removal function was not found");
  assert.ok(!/thumbnail|mockup|previewUrl/i.test(removal),
    "the removal route must not accept an id derived from an image URL");
  /* It reads the product and refuses on the title instead. */
  assert.match(removal, /INTERNAL_TEST_PREFIX/);
  assert.match(removal, /confirmedGone/);
});
