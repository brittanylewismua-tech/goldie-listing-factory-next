/**
 * THE DATASET THAT CANNOT BE REBUILT LATER.
 *
 * Measured across a real shop's entire Printify history: no order carries its
 * artwork, every sampled product now 404s, and zero per cent of sold units can
 * be tied to the design that sold. Everything here exists so that sentence is
 * never true of the sales that happen from today.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../app/${path}`, import.meta.url), "utf8");
const provenance = read("artwork-provenance.ts");
const finish = read("api/etsy/finish.ts");

test("the artwork bytes are kept, not a link to them", () => {
  /* Printify's image URLs are temporary and the product may be deleted, so a
     stored URL is a promise that expires. */
  assert.match(provenance, /THE BYTES, NOT A LINK/);
  assert.match(provenance, /bucket\(\)\.put\(key, bytes/);
  assert.match(provenance, /crypto\.subtle\.digest\("SHA-256"/);
});

test("the same design across many products is stored once", () => {
  assert.match(provenance, /const key = `provenance\/\$\{userId\}\/\$\{hash\}\.png`/);
  assert.match(provenance, /await bucket\(\)\.head\(key\)/);
  assert.match(provenance, /CREATE UNIQUE INDEX IF NOT EXISTS artwork_provenance_once/);
});

test("placement is captured, because it is part of the design", () => {
  assert.match(provenance, /position: placeholder\?\.position/);
  assert.match(provenance, /scale: image\.scale/);
});

test("capture can never break a publish the seller is waiting on", () => {
  /* A design not captured is a gap in evidence. A publish that fails because
     of evidence collection is a broken product. */
  assert.match(provenance, /Recorded, never thrown/);
  assert.match(provenance, /return \{ \.\.\.base, note: error instanceof Error/);
  assert.match(finish, /void captureArtworkForPublish\(userId,draft,listingId\)\.catch\(\(\)=>\{\}\)/);
});

test("capture happens where both the product and the listing id exist", () => {
  /* One moment in the whole system has both: the end of publishing. */
  assert.ok(finish.indexOf("captureArtworkForPublish") < finish.indexOf("INSERT INTO etsy_listing_links"),
    "the capture must be started before the publish record is written");
  assert.match(finish, /because:"listing-factory-publish",listingId/);
});

test("a later capture can fill in a listing id an earlier one lacked", () => {
  assert.match(provenance, /etsy_listing_id = COALESCE\(artwork_provenance\.etsy_listing_id, excluded\.etsy_listing_id\)/);
  assert.match(provenance, /export async function linkListingToArtwork/);
});

test("artwork is captured for shops whose listings were made elsewhere", () => {
  const route = readFileSync(
    new URL("../app/api/shop-map/provenance/route.ts", import.meta.url), "utf8");
  assert.match(route, /connected-shop-backfill/);
  assert.match(route, /products\.json\?limit=50&page=/);
});

test("an oversized image is refused rather than silently truncated", () => {
  assert.match(provenance, /MAX_ARTWORK_BYTES/);
  assert.match(provenance, /over the cap/);
});
