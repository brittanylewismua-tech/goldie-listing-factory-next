/*
  THE ONE MAPPING THE FACTORY ADMITS IT CANNOT MAKE WAS THE ONE NOBODY SAW.

  /api/listing-intelligence handles a blueprint it cannot map by calling
  reviewFallback: `confidence: "review"`, a category GUESSED from the product's
  name — "Handmade Items" when nothing else matches — and no properties at all.

  That value was computed on the server and read nowhere in the interface. And
  because the guessed category is non-empty and there are no required
  properties to be missing, shouldOpenEtsyDetails returned false: the panel
  stayed collapsed. A guess on an unrecognised product type, never looked at,
  heading for a real Etsy listing — while a confidently mapped product looked
  exactly the same.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldOpenEtsyDetails, needsCategoryReview }
  from "../app/etsy-details-disclosure.ts";

test("a review-confidence listing opens its details panel", () => {
  /* Exactly what reviewFallback returns for an unsupported blueprint. */
  const unsupported = { category: "Handmade Items", confidence: "review", properties: [] };
  assert.equal(shouldOpenEtsyDetails(unsupported), true,
    "the least trustworthy mapping must not be the one that stays collapsed");
  assert.equal(needsCategoryReview(unsupported), true);
});

test("the two original cases still open it", () => {
  assert.equal(shouldOpenEtsyDetails({ category: "", confidence: "high" }), true);
  assert.equal(shouldOpenEtsyDetails({
    category: "T-Shirts", confidence: "high",
    properties: [{ required: true, value: "" }],
  }), true);
});

test("a confident, complete mapping stays collapsed", () => {
  const mapped = {
    category: "Clothing > Tops & Tees > T-shirts",
    confidence: "high",
    properties: [{ required: true, value: "Short sleeve" }],
  };
  assert.equal(shouldOpenEtsyDetails(mapped), false);
  assert.equal(needsCategoryReview(mapped), false);
});

test("confidence is absent-tolerant, so an older saved batch behaves as before", () => {
  /* Batches saved before this field existed have no confidence at all; they
     must not all spring open, and must not all be called reviewed. */
  assert.equal(shouldOpenEtsyDetails({ category: "Mugs", properties: [] }), false);
  assert.equal(needsCategoryReview({}), false);
});

test("the guess is labelled as a guess where the member edits it", () => {
  const app = readFileSync(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  assert.match(app, /needsCategoryReview\(details\)&&/,
    "the notice must be driven by the server's own confidence value");
  assert.match(app, /Check this category before you publish/);
  /* It says WHY, not just that something is wrong. */
  assert.match(app, /not one the factory recognises/);
  assert.match(app, /none of its attributes have been filled in/);
});

test("the server still refuses to invent a category for an unmapped blueprint", () => {
  /* The fallback is the honest half of this and must stay honest: no family,
     no facts, or no taxonomy node means no guessed attributes. */
  const route = readFileSync(new URL(
    "../app/api/listing-intelligence/route.ts", import.meta.url), "utf8");
  assert.match(route, /if\(!family\|\|!facts\.mapped\|\|!classification\.etsyTaxonomyNodeId\)\s*\n?\s*return NextResponse\.json\(\{details:reviewFallback\(body\.product\)\}\)/);
  assert.match(route, /confidence:"review"/);
});
