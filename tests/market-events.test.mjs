/**
 * THE TWENTY-FIVE SCENARIOS, WHERE THEY CAN BE DECIDED WITHOUT A NETWORK.
 *
 * Each of these is a way the marketplace has actually behaved, and each one
 * decides whether a member is told a listing is selling. Getting one wrong is
 * not a bug in a chart; it is telling somebody to build a product line on a
 * restock.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  diffSnapshots, salesLinked, bulkEditSuspected, editedInSameInterval, IMPLAUSIBLE_DROP,
} from "../app/market-events.ts";

const snap = (over = {}) => ({
  listingId: 1, shopId: 10, observedAt: "2026-09-13T10:00:00.000Z",
  quantity: 100, state: "active", priceCents: 4200, favorites: 50, views: 900,
  lastModified: 1_780_000_000, originalCreated: 1_700_000_000, taxonomyId: 1855,
  titleHash: "t1", tagsHash: "g1", imageHash: "i1", ...over,
});
const later = (over = {}) => snap({ observedAt: "2026-09-13T10:20:00.000Z", ...over });
const types = events => events.map(event => event.type).sort();

test("1 · shop sold one and one listing fell by one", () => {
  const events = diffSnapshots(snap(), later({ quantity: 99 }));
  const out = salesLinked(events, 1, 20);
  assert.equal(out.linked.length, 1);
  assert.equal(out.linked[0].units, 1);
  assert.equal(out.unresolved, 0);
});

test("2 · shop sold three and three listings fell", () => {
  const events = [
    ...diffSnapshots(snap({ listingId: 1 }), later({ listingId: 1, quantity: 99 })),
    ...diffSnapshots(snap({ listingId: 2 }), later({ listingId: 2, quantity: 99 })),
    ...diffSnapshots(snap({ listingId: 3 }), later({ listingId: 3, quantity: 99 })),
  ];
  const out = salesLinked(events, 3, 40);
  assert.equal(out.linked.length, 3);
  assert.equal(out.unresolved, 0);
});

test("3 · shop sold three and only one listing shows evidence — two stay unresolved", () => {
  /* The rule that does not bend: the other two are never spread across
     listings by views, favourites, age or popularity. */
  const events = diffSnapshots(snap(), later({ quantity: 99 }));
  const out = salesLinked(events, 3, 20);
  assert.equal(out.linked.length, 1);
  assert.equal(out.unresolved, 2);
});

test("4 · quantity fell but the shop sold nothing — not a sale", () => {
  const events = diffSnapshots(snap(), later({ quantity: 90 }));
  assert.deepEqual(salesLinked(events, 0, 20).linked, []);
});

test("5 · a restock is recorded as an increase and never as a sale", () => {
  const events = diffSnapshots(snap({ quantity: 4 }), later({ quantity: 400 }));
  assert.ok(types(events).includes("aggregate_quantity_increased"));
  assert.deepEqual(salesLinked(events, 5, 20).linked, []);
});

test("6 · a bulk update disqualifies the whole interval", () => {
  const events = [1, 2, 3, 4, 5].flatMap(id =>
    diffSnapshots(snap({ listingId: id }), later({ listingId: id, quantity: 99 })));
  const out = salesLinked(events, 5, 8);
  assert.equal(out.conflicted, true);
  assert.deepEqual(out.linked, []);
  assert.equal(out.unresolved, 5);
});

test("7 · selling out is its own event and counts as sales-linked", () => {
  const events = diffSnapshots(snap({ quantity: 1 }), later({ quantity: 0, state: "sold_out" }));
  assert.ok(types(events).includes("listing_sold_out"));
  assert.equal(salesLinked(events, 1, 20).linked[0].reason, "quantity_fell");
});

test("8 · a sold-out listing coming back with stock is a renewal, not a new listing", () => {
  const events = diffSnapshots(
    snap({ quantity: 0, state: "sold_out" }),
    later({ quantity: 10, state: "active", lastModified: 1_780_000_500 }));
  assert.ok(types(events).includes("listing_renewed"));
  assert.ok(types(events).includes("listing_reactivated"));
});

test("9 · a listing going inactive is recorded, not silently dropped", () => {
  const events = diffSnapshots(snap(), later({ state: "inactive" }));
  assert.ok(types(events).includes("listing_became_inactive"));
});

test("13 · a favourites spike with no shop sale is attention, never a sale", () => {
  const events = diffSnapshots(snap(), later({ favorites: 300, views: 4000 }));
  assert.deepEqual(types(events), ["favorites_increased", "views_increased"]);
  assert.deepEqual(salesLinked(events, 0, 20).linked, []);
});

test("22 · a print provider resetting stock is not twenty sales", () => {
  /* Printify pushes quantity back to a ceiling; the fall on the next cycle is
     arithmetic, not buyers. */
  const events = diffSnapshots(snap({ quantity: 999 }), later({ quantity: 900 }));
  assert.deepEqual(salesLinked(events, 3, 20).linked, []);
});

test("23 · assigned units can never exceed what the shop says it sold", () => {
  const events = [1, 2].flatMap(id =>
    diffSnapshots(snap({ listingId: id, quantity: 20 }), later({ listingId: id, quantity: 14 })));
  const out = salesLinked(events, 4, 40);
  assert.equal(out.linked.reduce((sum, row) => sum + row.units, 0), 4);
  assert.equal(out.unresolved, 0);
});

test("25 · a listing edited in the same interval as a shop sale is not credited", () => {
  const events = diffSnapshots(
    snap(),
    later({ quantity: 99, titleHash: "t2", imageHash: "i2", priceCents: 3900 }));
  assert.equal(editedInSameInterval(events, 1), true);
  assert.deepEqual(salesLinked(events, 1, 20).linked, []);
});

test("the cap fills the same way every time it is asked", () => {
  const events = [
    ...diffSnapshots(snap({ listingId: 7, quantity: 20 }), later({ listingId: 7, quantity: 19 })),
    ...diffSnapshots(snap({ listingId: 3, quantity: 20 }), later({ listingId: 3, quantity: 17 })),
    ...diffSnapshots(snap({ listingId: 5, quantity: 20 }), later({ listingId: 5, quantity: 19 })),
  ];
  const once = salesLinked(events, 3, 40).linked.map(row => [row.listingId, row.units]);
  const twice = salesLinked(events, 3, 40).linked.map(row => [row.listingId, row.units]);
  assert.deepEqual(once, twice);
  /* Biggest movement first, then the lower id. */
  assert.deepEqual(once, [[3, 3]]);
});

test("an implausible drop is inventory management, whatever the shop sold", () => {
  const events = diffSnapshots(snap(), later({ quantity: 100 - IMPLAUSIBLE_DROP - 1 }));
  assert.deepEqual(salesLinked(events, 30, 20).linked, []);
});

test("renewal never resets a listing's age", () => {
  /* original_creation_timestamp is the birth date; creation_timestamp lies. */
  const events = diffSnapshots(
    snap({ quantity: 0, state: "sold_out" }),
    later({ quantity: 10, state: "active", lastModified: 1_780_000_900, originalCreated: 1_700_000_000 }));
  assert.ok(!types(events).includes("listing_discovered"));
});

test("a quiet interval produces no events at all", () => {
  assert.deepEqual(diffSnapshots(snap(), later()), []);
});

test("a shop with few listings moving is not called a bulk edit", () => {
  const events = [1, 2].flatMap(id =>
    diffSnapshots(snap({ listingId: id }), later({ listingId: id, quantity: 99 })));
  assert.equal(bulkEditSuspected(events, 50), false);
});
