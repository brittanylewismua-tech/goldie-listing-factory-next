/* D612 - the controlled diagnostic that names the failing Printify subsystem.

   The normal draft path cannot answer this. It retries product creation seven
   times and re-uploads the artwork midway, so a failure tells you only "it did
   not work". This does the opposite of a retry ladder. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const probe = strip(await read("app/api/printify/probe/route.ts"));

test("the artwork is uploaded exactly once", () => {
  // A second upload would destroy the experiment: a new ID resets the question.
  const uploads = probe.match(/\/uploads\/images\.json/g) || [];
  assert.equal(uploads.length, 1, "one upload call, no re-upload on failure");
  assert.ok(!/createProductWithImageRetries/.test(probe), "no retry ladder anywhere in the probe");
});

test("the official lookup is polled slowly, and bounded", () => {
  assert.match(probe, /\/uploads\/\$\{encodeURIComponent\(imageId\)\}\.json/);
  assert.match(probe, /LOOKUP_ATTEMPTS = 12/);
  assert.match(probe, /LOOKUP_INTERVAL_MS = 10_000/);
  assert.match(probe, /attempt <= LOOKUP_ATTEMPTS/);
});

test("product creation is attempted at most once, and only after a successful lookup", () => {
  assert.match(probe, /if \(lookupSucceeded && body\.createProduct !== false\)/);
  const products = probe.match(/\/shops\/\$\{session\.shop_id\}\/products\.json/g) || [];
  assert.equal(products.length, 1);
});

test("Printify's raw status and body are recorded at every step", () => {
  // The friendly message is what hid the problem for hours. Keep the literal.
  assert.match(probe, /const body = await response\.text\(\)/);
  assert.match(probe, /status: response\.status/);
  assert.match(probe, /note\("upload", upload\)/);
  assert.match(probe, /note\(`lookup-\$\{attempt\}`, lookup\)/);
  assert.match(probe, /note\("product", product\)/);
});

test("the three outcomes are named, not left to interpretation", () => {
  assert.match(probe, /"lookup-never-succeeded"/, "Printify never registered it");
  assert.match(probe, /"lookup-200-but-product-8253"/, "Printify's services disagree");
  assert.match(probe, /"both-succeeded"/, "a temporary incident that has passed");
});

test("it is owner-gated and never a customer surface", () => {
  assert.match(probe, /if \(!isOwner\(user\)\) return NextResponse\.json\(\{ error: "Not available\." \}, \{ status: 404 \}\)/);
});

test("staged artwork ownership is proved before it is read", () => {
  assert.match(probe, /artwork\.customMetadata\?\.owner !== user\.userId/);
  assert.match(probe, /session = await runtimeEnv\(\)\.DB\?\.prepare/);
  assert.match(probe, /AND user_id = \? AND expires_at > unixepoch\(\)/);
});

test("the whole probe stays far inside Printify's failure budget", () => {
  /* Printify requires failed requests stay under 5% of an integration's traffic.
     One upload, at most twelve lookups, at most one product call - and no loop
     that could ever repeat the whole thing. */
  assert.ok(!/while\s*\(/.test(probe), "no unbounded loop");
  const forLoops = probe.match(/for \(/g) || [];
  assert.ok(forLoops.length <= 2, "only the bounded lookup poll and the base64 chunker");
});
