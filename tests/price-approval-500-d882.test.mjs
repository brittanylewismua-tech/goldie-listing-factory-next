import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* D882 · D881 made the finished-cost gate reachable and its handler run. The
   press then failed on a bodiless 500 from the update route, so the gate still
   could not be released - the fourth fault in this chain, and the first one
   that was server side. */

const route = readFileSync(new URL("../app/api/printify/drafts/update/route.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

test("print areas are only rebuilt when a placement was actually sent", () => {
  /* The block is entered for a placement OR a price approval, but its body
     dereferences body.placement. A price approval sends no placement. */
  assert.match(route, /if\(body\.placement\)placementPayload=\(current\.print_areas\|\|\[\]\)\.map/,
    "the map must be guarded, or approving prices throws and returns a bodiless 500");
  assert.doesNotMatch(route, /\n    placementPayload=\(current\.print_areas\|\|\[\]\)\.map/,
    "the unguarded form is gone");
});

test("the price branch still gets the product it needs to validate against", () => {
  assert.match(route, /if\(body\.placement\|\|body\.variantPrices\|\|body\.artworkUpdate\)\{/,
    "the fetch must still run for a price-only request");
  assert.match(route, /currentProduct=current;/);
  assert.match(route, /const variants=currentProduct\?\.variants\|\|\[\];/);
});

test("a bodiless error response reports its status, not a JSON parse failure", () => {
  const save = app.slice(app.indexOf("async function saveActualDraftPricing"));
  assert.match(save.slice(0, 1200), /await response\.json\(\)\.catch\(\(\)=>\(\{\}\)\)/,
    "parsing an empty body threw and masked the real failure");
  assert.match(save.slice(0, 1200), /could not save the final variant prices \(\$\{response\.status\}\)/);
});
