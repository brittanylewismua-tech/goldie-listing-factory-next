/*
  A MEMBER COULD NOT FIND DRAFTS THAT EXISTED.

  Denise reported "Product not found - This listing isn't available in the
  selected store" on every draft she built, and duplicating one failed the
  same way. The drafts were fine. Printify's own links carry no store, so its
  interface opened whichever store she had selected, and she has more than one.

  Goldie knew which store it built in and simply never said.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const template = readFileSync(new URL("../app/api/printify/route.ts", import.meta.url), "utf8");
const job = readFileSync(new URL(
  "../app/api/printify/drafts/execute-job.ts", import.meta.url), "utf8");
const ui = readFileSync(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

test("the store name is carried from the template match to the draft", () => {
  assert.match(template, /shop_title: found\.shop\.title/);
  assert.match(template, /shop_count: shops\.length/);
  assert.match(job, /printifyShopName: shop\.title/);
  assert.match(job, /printifyShopCount: shop\.count/);
});

test("the store is carried without a schema migration", () => {
  /* It rides in the template blob that is already stored. */
  assert.match(job, /session\.template_json/);
  assert.doesNotMatch(job, /ALTER TABLE printify_batch_sessions/);
});

test("Goldie still builds in whichever store holds the template", () => {
  /* The search across stores was always correct and must stay. */
  assert.match(template, /attempts\.find/);
  assert.match(template, /found\.shop\.id/);
});

test("the member is not told to do what Goldie now does for them", () => {
  /*
    D1449 named the store in the interface because Goldie could not control
    where Printify opened. D1453 can: it switches the store first. Leaving the
    old copy in place would instruct a member to perform a step that has
    already happened, which reads as the fix not working.
  */
  assert.doesNotMatch(ui, /set Printify to that store first/);
  assert.doesNotMatch(ui, /switch to that one at the top of Printify/);
});

test("the store still travels with the draft, for the support lookup", () => {
  /* The data stays even though the interface stopped mentioning it. */
  assert.match(job, /printifyShopName: shop\.title/);
});
