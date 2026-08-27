/* D613 - the retry ladder was the wrong shape for a deterministic payload error.

   Seven product attempts over 125 seconds is right for a propagation race and
   wrong for a bad request. Measured: a stale inherited image ID produced 8253 on
   all seven attempts, four runs in a row. Nothing about the seventh attempt was
   more likely to succeed than the first, and Printify asks that failed requests
   stay under 5% of an integration's traffic. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const creation = strip(await read("app/api/printify/product-creation.ts"));
const route = strip(await read("app/api/printify/drafts/route.ts"));

test("a repeated image error stops instead of running the full ladder", () => {
  assert.match(creation, /const IMAGE_ERROR_LIMIT = 2/);
  assert.match(creation, /if \(isImageNotReady\(response\.status, detail\)\) imageErrors \+= 1/);
  assert.match(creation, /if \(imageErrors > IMAGE_ERROR_LIMIT\)/);
  assert.match(creation, /Goldie stopped instead of retrying\. Nothing was created\./);
});

test("exactly one controlled re-upload, on the first image error", () => {
  assert.match(route, /if \(imageErrors === 1\)/);
  assert.ok(!/attempt === 3/.test(route), "the old third-attempt re-upload is gone");
});

test("transport faults keep the full ladder", () => {
  // 429, 5xx and dropped connections really do pass. Only the payload error is final.
  assert.match(creation, /response\.status === 429 \|\| response\.status >= 500/);
  assert.match(creation, /const waits = \[3000, 7000, 15000, 20000, 30000, 45000\]/);
});

test("a failed draft charges no quota and leaves no duplicate", () => {
  /* The row is marked failed on any throw, and the plan check counts only
     succeeded rows plus recently-running ones, so a failure frees the slot. */
  assert.match(route, /SET status = 'failed'[\s\S]{0,80}WHERE request_key = \? AND status != 'succeeded'/);
  assert.match(route, /COUNT\(\*\) count FROM printify_draft_results WHERE user_id=\? AND \(\(status='succeeded'/);
  /* One row per batch+design, and a succeeded row short-circuits before any
     Printify call, so a retry cannot create a second product. */
  assert.match(route, /ON CONFLICT\(request_key\) DO UPDATE/);
  assert.match(route, /if \(prior\?\.status === "succeeded" && prior\.response_json\) return NextResponse\.json\(\{ draft: JSON\.parse\(prior\.response_json\) \}\)/);
});
