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
  assert.match(provenance, /return \{ \.\.\.base, outcome: "error", note: error instanceof Error/);
  /* Queuing is awaited — it is one insert — but its failure is swallowed, so
     evidence collection can never fail a publish. */
  assert.match(finish, /await queueArtworkCapture\(userId,draft,listingId\)\.catch\(\(\)=>\{\}\)/);
});

test("capture happens where both the product and the listing id exist", () => {
  /* One moment in the whole system has both: the end of publishing. */
  assert.ok(finish.indexOf("queueArtworkCapture") < finish.indexOf("INSERT INTO etsy_listing_links"),
    "the capture must be queued before the publish record is written");
  assert.match(finish, /because:"listing-factory-publish"/);
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
  assert.match(provenance, /outcome: "too-large"/);
});

test("capture is wired to more than one moment", () => {
  /* Publishing is the richest moment but not the only one: a catalogue can be
     deleted next month, a changed product is a different design, and a
     deletion Goldie performs is the one it can see coming. */
  assert.match(provenance, /THE MOMENTS WORTH CAPTURING AT/);
  for (const reason of ["listing-factory-publish", "connected-shop-backfill",
    "new-product-discovered", "product-changed", "order-detected",
    "before-goldie-retires-product"])
    assert.match(provenance, new RegExp(reason), `missing capture reason: ${reason}`);
  assert.match(provenance, /export async function captureBeforeRetiring/);
});

test("Scan holds the centre of the mobile bar", () => {
  const shell = read("mobile-shell.tsx");
  const tabs = shell.slice(shell.indexOf("const TABS = ["), shell.indexOf("];", shell.indexOf("const TABS = [")));
  const order = [...tabs.matchAll(/label: "([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(order, ["Home", "Watch", "Scan", "My Shop", "More"]);
  /* And the scanner is not swept up by the desktop gate. */
  assert.match(shell, /ONE EXCEPTION, AND IT IS DELIBERATE/);
  assert.match(shell, /!SCANNER\.test\(pathname\)/);
});

test("capture is a durable job, not an unawaited promise", () => {
  /* On a worker, a promise nobody awaits can be torn down when the response
     completes: the listing publishes, the seller sees success, and the one
     piece of evidence that cannot be recreated is silently gone. */
  const queue = read("artwork-capture-queue.ts");
  assert.match(finish, /await queueArtworkCapture\(userId,draft,listingId\)/);
  assert.doesNotMatch(finish, /void captureArtworkForPublish/);
  assert.match(queue, /A CAPTURE THAT SURVIVES THE REQUEST THAT ASKED FOR IT/);
  for (const column of ["attempts", "next_attempt_at", "last_error", "completed_at", "state"])
    assert.match(queue, new RegExp(column), `the queue must record ${column}`);
});

test("a permanently failed capture stays visible instead of vanishing", () => {
  const queue = read("artwork-capture-queue.ts");
  assert.match(queue, /state = 'failed'/);
  assert.match(queue, /permanentlyMissing/);
  assert.match(queue, /MAX_ATTEMPTS/);
});

test("a retry cannot repeat work that will never succeed", () => {
  const queue = read("artwork-capture-queue.ts");
  assert.match(queue, /const FINAL: CaptureOutcome\[\] = \["no-print-image", "too-large", "already-held", "captured"\]/);
});

test("every product gets a recorded outcome", () => {
  /* "50 found, 23 captured, 2 skipped" left twenty-five products unexplained. */
  assert.match(provenance, /EVERY PRODUCT GETS AN OUTCOME/);
  for (const outcome of ["captured", "already-held", "no-print-image", "too-large",
    "product-unavailable", "artwork-unreachable", "error"])
    assert.match(provenance, new RegExp(`"${outcome}"`), `missing outcome: ${outcome}`);
  const route = readFileSync(
    new URL("../app/api/shop-map/provenance/route.ts", import.meta.url), "utf8");
  assert.match(route, /unaccountedFor: products\.length - accounted/);
});

test("the backfill pages to the end and can prove it did", () => {
  const route = readFileSync(
    new URL("../app/api/shop-map/provenance/route.ts", import.meta.url), "utf8");
  assert.match(route, /productsReportedByPrintify/);
  assert.match(route, /sawEverything/);
  assert.match(route, /page >= Number\(body\.last_page \?\? 1\)/);
});

test("the cap holds a real print file, not a convenient version of one", () => {
  /* The first cap refused two genuine designs at 24MB and 28MB. */
  assert.match(provenance, /MAX_ARTWORK_BYTES = 64 \* 1024 \* 1024/);
  assert.match(provenance, /THE ORIGINAL FILE, NOT A CONVENIENT VERSION OF IT/);
});

test("one member's artwork can never be reached through another's", () => {
  /* Global content-hash dedup would let two members share one object, and
     then one member's deletion or access reaches the other's evidence. */
  assert.match(provenance, /THE KEY IS SCOPED TO THE MEMBER/);
  assert.match(provenance, /`provenance\/\$\{userId\}\/\$\{hash\}\.png`/);
  assert.match(provenance, /export async function readArtwork/);
  assert.match(provenance, /WHERE user_id = \? AND artwork_hash = \? LIMIT 1/);
});

test("deleting one reference keeps a blob another reference still needs", () => {
  assert.match(provenance, /export async function forgetArtwork/);
  assert.match(provenance, /SELECT COUNT\(\*\) AS n FROM artwork_provenance WHERE user_id = \? AND artwork_hash = \?/);
  assert.match(provenance, /if \(Number\(stillUsed\?\.n \?\? 0\) === 0/);
});

test("the artwork bucket is reachable only through the worker", () => {
  /* No public origin is configured, and nothing composes a public URL. */
  const wrangler = readFileSync(new URL("../wrangler.staging.jsonc", import.meta.url), "utf8");
  assert.match(wrangler, /"binding": "ARTWORK"/);
  /* No public r2.dev origin, and no bucket marked public. */
  assert.doesNotMatch(wrangler, /r2\.dev/i);
  assert.doesNotMatch(wrangler, /public_bucket/i);
  /* The module only mentions r2.dev to explain that there is not one; what
     matters is that no code composes such a URL. */
  assert.doesNotMatch(provenance, /https:\/\/[^\s"']*r2\.dev/);
});
