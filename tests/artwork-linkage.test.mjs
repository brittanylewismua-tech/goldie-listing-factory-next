/**
 * LINKING A CAPTURED DESIGN TO THE LISTING THAT SOLD IT.
 *
 * A link turns "a design this shop has" into "the design behind these sales".
 * A wrong link does not look wrong — it looks like a design that sold — so
 * ambiguity has to stay ambiguous rather than resolve to the nearest thing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { attemptLink, summarise } from "../app/artwork-linkage.ts";

const NOW = 1_780_000_000;
const product = (over = {}) => ({
  productId: "p1", metadataListingId: null, externalId: "",
  skus: ["13857878400887176023"], title: "Witch Cats Hoodie",
  createdAt: NOW, variantCount: 12, ...over,
});
const listing = (over = {}) => ({
  listingId: 775737221, skus: ["1088299889"], title: "Witch Cats Hoodie",
  createdAt: NOW + 120, productIdsFromOrders: [], ...over,
});

test("a listing id in Printify metadata is exact and usable", () => {
  const out = attemptLink(product({ metadataListingId: 775737221 }), [listing()]);
  assert.equal(out.method, "printify-metadata-listing-id");
  assert.equal(out.confidence, "exact");
  assert.equal(out.safeForSalesBackedUse, true);
});

test("an order-to-receipt relationship is exact, because every hop was", () => {
  const out = attemptLink(product(), [listing({ productIdsFromOrders: ["p1"] })]);
  assert.equal(out.method, "order-receipt-relationship");
  assert.equal(out.safeForSalesBackedUse, true);
  assert.match(out.evidence[0], /shop_order_id/);
});

test("one product under several listings' orders is rejected, not resolved", () => {
  const out = attemptLink(product(), [
    listing({ listingId: 1, productIdsFromOrders: ["p1"] }),
    listing({ listingId: 2, productIdsFromOrders: ["p1"] }),
  ]);
  assert.equal(out.listingId, null);
  assert.equal(out.candidates, 2);
  assert.match(out.rejected, /several listings/i);
});

test("differing SKUs do not link — measured on this very shop", () => {
  /* Etsy 1088299889 against Printify 13857878400887176023. */
  const out = attemptLink(product(), [listing({ createdAt: NOW + 999_999 })]);
  assert.equal(out.listingId, null);
  assert.equal(out.method, null);
});

test("an identical SKU links, but is never safe for a sales-backed claim", () => {
  const out = attemptLink(product({ skus: ["WOLF-TEE-BLK"] }),
    [listing({ skus: ["WOLF-TEE-BLK"], createdAt: NOW + 999_999 })]);
  assert.equal(out.method, "identical-sku");
  assert.equal(out.confidence, "strong");
  assert.equal(out.safeForSalesBackedUse, false, "two products can share one SKU");
});

test("a SKU on more than one listing is rejected", () => {
  const out = attemptLink(product({ skus: ["SHARED"] }), [
    listing({ listingId: 1, skus: ["SHARED"], createdAt: NOW + 999_999 }),
    listing({ listingId: 2, skus: ["SHARED"], createdAt: NOW + 999_999 }),
  ]);
  assert.equal(out.listingId, null);
  assert.match(out.rejected, /more than one listing/i);
});

test("timing alone is weak and never sales-backed", () => {
  const out = attemptLink(product({ skus: [] }), [listing()]);
  assert.equal(out.method, "identity-and-timestamp");
  assert.equal(out.confidence, "weak");
  assert.equal(out.safeForSalesBackedUse, false);
});

test("two listings in the same window stay unlinked", () => {
  const out = attemptLink(product({ skus: [] }), [
    listing({ listingId: 1 }), listing({ listingId: 2, createdAt: NOW + 300 }),
  ]);
  assert.equal(out.listingId, null);
  assert.equal(out.candidates, 2);
});

test("title similarity alone never creates a relationship", () => {
  /* Identical titles, nothing else in common. */
  const out = attemptLink(
    product({ skus: [], title: "Witch Cats Hoodie", createdAt: NOW }),
    [listing({ title: "Witch Cats Hoodie", createdAt: NOW + 5_000_000 })]);
  assert.equal(out.listingId, null);
});

test("the summary separates linked from safe to build claims on", () => {
  const out = summarise([
    attemptLink(product({ metadataListingId: 775737221 }), [listing()]),
    attemptLink(product({ productId: "p2", skus: ["WOLF"] }),
      [listing({ skus: ["WOLF"], createdAt: NOW + 999_999 })]),
    attemptLink(product({ productId: "p3", skus: [] }), []),
  ]);
  assert.equal(out.attempted, 3);
  assert.equal(out.linked, 2);
  assert.equal(out.safeForSalesBackedUse, 1, "only the exact one counts");
  assert.equal(out.unlinked, 1);
});
