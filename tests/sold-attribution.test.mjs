import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = name => readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8");
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const { attribute, shopDelta } = await import("../app/sold-attribution.ts");

const shop = (soldDelta, activeCount, watchedCount) => ({ soldDelta, activeCount, watchedCount });

test("a drop in a shop that sold nothing is not a sale", () => {
  /* THE GATE. A quantity drop with no matching sale at the shop is a restock,
     a variant edit, or somebody tidying inventory. */
  const out = attribute(
    [{ listingId: 1, shopId: 10, sold: 9 }],
    new Map([[10, shop(0, 4, 4)]]));
  assert.deepEqual(out, []);
});

test("a shop with no reading at all shows nothing", () => {
  /* Unverifiable is not the same as true. */
  assert.deepEqual(attribute([{ listingId: 1, shopId: 10, sold: 5 }], new Map()), []);
});

test("one live listing means Etsy has already counted it", () => {
  /* No inference of any kind: the shop's sales ARE the listing's sales, and
     Etsy's ledger beats arithmetic on stock levels where they disagree. */
  const out = attribute(
    [{ listingId: 1, shopId: 10, sold: 3 }],
    new Map([[10, shop(7, 1, 1)]]));
  assert.equal(out[0].sold, 7);
  assert.equal(out[0].attribution, "exact");
});

test("a shop can never be credited with more than it sold", () => {
  /* THE CAP. Three listings claiming five each, in a shop that sold six. */
  const out = attribute([
    { listingId: 1, shopId: 10, sold: 5 },
    { listingId: 2, shopId: 10, sold: 5 },
    { listingId: 3, shopId: 10, sold: 5 },
  ], new Map([[10, shop(6, 3, 3)]]));
  assert.equal(out.reduce((sum, r) => sum + r.sold, 0), 6);
});

test("the cap fills deterministically and drops what it cannot cover", () => {
  /* Same data must always produce the same board: biggest drop first, then
     lowest id. A listing that gets nothing is dropped, never shown as zero. */
  const out = attribute([
    { listingId: 9, shopId: 10, sold: 4 },
    { listingId: 2, shopId: 10, sold: 4 },
    { listingId: 5, shopId: 10, sold: 1 },
  ], new Map([[10, shop(6, 3, 3)]]));
  assert.deepEqual(out.map(r => [r.listingId, r.sold]), [[2, 4], [9, 2]]);
  assert.ok(!out.some(r => r.sold === 0));
});

test("watching everything the shop has live makes the cap tight", () => {
  const out = attribute(
    [{ listingId: 1, shopId: 10, sold: 2 }],
    new Map([[10, shop(9, 5, 5)]]));
  assert.equal(out[0].attribution, "bounded");
});

test("a shop selling things we do not watch is the weakest class", () => {
  /* Some of its total belongs to listings outside this set, so the cap is a
     ceiling that will rarely bite. Labelled, not quietly mixed in. */
  const out = attribute(
    [{ listingId: 1, shopId: 10, sold: 2 }],
    new Map([[10, shop(900, 400, 3)]]));
  assert.equal(out[0].attribution, "corroborated");
});

test("no number is ever apportioned by a ratio", () => {
  /* Splitting a shop total across listings by favourites — or by anything
     else — is the invented number this feature exists to avoid. Every figure
     is the listing's own observed drop, or an exact one-listing shop count. */
  const source = strip(read("sold-attribution.ts"));
  for (const forbidden of [/favor/i, /favour/i, /proportion/i, /ratio/i, /\bshare\b/, /\bsplit\b/])
    assert.doesNotMatch(source, forbidden, `attribution must not apportion: ${forbidden}`);
});

test("a listing with no shop cannot be checked, so it is not shown", () => {
  assert.deepEqual(attribute([{ listingId: 1, shopId: null, sold: 4 }], new Map()), []);
});

test("a revised shop count is a correction, not a refund", () => {
  assert.equal(shopDelta(500, 480), 0);
  assert.equal(shopDelta(500, 512), 12);
});
