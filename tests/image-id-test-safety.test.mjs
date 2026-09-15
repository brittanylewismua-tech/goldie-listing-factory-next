/**
 * A TEST THAT WRITES TO A REAL ETSY SHOP.
 *
 * This one creates a listing on a live shop, so the safety properties matter
 * more than the measurement it produces: it must never touch an existing
 * listing, never publish, always clean up, and never be able to fire by
 * accident.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../app/api/shop-map/image-id-test/route.ts", import.meta.url), "utf8");

test("it cannot run without an explicit confirmation", () => {
  assert.match(source, /confirm.*!== "create-and-delete-test-draft"/);
  assert.match(source, /cannot fire by accident/);
});

test("it is owner-only", () => {
  assert.match(source, /!isOwner\(user\)/);
});

test("it creates its own draft and never names an existing listing", () => {
  /* Every listing-scoped call uses the id this route created. */
  assert.match(source, /state: "draft"/);
  assert.match(source, /GOLDIE INTERNAL — image id test, do not publish/);
  /* Every listing-scoped call names either the draft this route created or
     the id passed to the cleanup route, which is verified to be a Goldie test
     draft before anything is deleted. */
  const listingCalls = [...source.matchAll(/listings\/\$\{([a-zA-Z]+)\}/g)].map(match => match[1]);
  for (const name of listingCalls)
    assert.ok(["listingId", "cleanup"].includes(name),
      `a listing call used ${name} rather than the created draft`);
});

test("nothing is published, and the state is read back rather than assumed", () => {
  assert.doesNotMatch(source, /state: "active"|state=active/);
  assert.match(source, /step: "state before deletion", state/);
  assert.match(source, /neverPublished/);
});

test("the draft is deleted and the deletion is verified", () => {
  assert.match(source, /method: "DELETE"/);
  assert.match(source, /confirmedGone: gone\.status === 404/);
  assert.match(source, /draftRemoved: gone\.status === 404/);
});

test("a failure still reports what exists so it can be cleaned up", () => {
  assert.match(source, /Anything listed under `created` may still exist/);
  assert.match(source, /created, steps,/);
});

test("the four possible behaviours are named, not left to inference", () => {
  for (const verdict of ["new-id-old-bytes-preserved", "new-id-old-image-removed",
    "same-id-different-bytes", "other"])
    assert.match(source, new RegExp(verdict), `missing verdict: ${verdict}`);
  /* And the verdict decides the wording, so the claim cannot outrun it. */
  assert.match(source, /verdict === "new-id-old-bytes-preserved"\s*\n?\s*\? "order-time Etsy image"\s*\n?\s*: "transaction-linked listing image"/);
});

test("bytes are compared by hash, not by trusting the id", () => {
  assert.match(source, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(source, /stillOriginalBytes: oldIdAfterOverwrite\.hash === hashA/);
  assert.match(source, /nowHoldsImageB: oldIdAfterOverwrite\.hash === hashB/);
});

test("the test images are Goldie's own, not the seller's", () => {
  assert.match(source, /nothing of the seller's is involved/);
  assert.match(source, /async function solidPng/);
});

test("the draft is deleted at the endpoint Etsy actually deletes from", () => {
  /* The shop-scoped path answers 404 and leaves the draft sitting in the
     seller's shop — which is what happened on the first run. */
  assert.match(source, /await call\(`\/listings\/\$\{listingId\}`, \{ method: "DELETE" \}\)/);
  assert.doesNotMatch(source, /`\/shops\/\$\{shopId\}\/listings\/\$\{listingId\}`, \{ method: "DELETE" \}/);
});

test("there is a way to remove a draft a failed run left behind", () => {
  assert.match(source, /parameters\.get\("cleanup"\)/);
  /* And it refuses to delete anything that is not a Goldie test draft. */
  assert.match(source, /!title\.startsWith\("GOLDIE INTERNAL"\)/);
  assert.match(source, /That listing is not a Goldie test draft\. Nothing was deleted\./);
});

test("the test images are built, not fetched from our own origin", () => {
  /* Fetching the worker's own origin returned sixteen identical bytes and the
     uploads failed, so the test proved nothing. */
  assert.match(source, /async function solidPng/);
  assert.match(source, /CompressionStream\("deflate"\)/);
  assert.match(source, /solidPng\(600, \[255, 79, 195\]\)/);
  assert.match(source, /solidPng\(600, \[12, 10, 14\]\)/);
  assert.doesNotMatch(source, /goldieSiteUrl/);
});

test("it refuses to create a draft it would not be able to delete", () => {
  /* The first run created one and then discovered deleting needs listings_d,
     leaving a draft in the seller's shop. Capability is checked first now. */
  assert.match(source, /DO NOT CREATE WHAT YOU CANNOT REMOVE/);
  assert.match(source, /includes\("listings_d"\)/);
  assert.match(source, /Nothing was created\./);
  /* And the check sits before the creation. */
  assert.ok(source.indexOf("listings_d") < source.indexOf("state: \"draft\""),
    "the capability check must precede creating the draft");
});
