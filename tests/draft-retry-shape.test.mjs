import {readDraftImplementation} from "./draft-implementation-source.mjs";
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
const route = strip(await readDraftImplementation());

test("a repeated image error stops instead of running the full ladder", () => {
  assert.match(creation, /const IMAGE_ERROR_LIMIT = 2/);
  assert.match(creation, /if \(isImageNotReady\(response\.status, detail\)\) imageErrors \+= 1/);
  assert.match(creation, /if \(imageErrors >= IMAGE_ERROR_LIMIT\)/);
  assert.match(creation, /The Listing Factory stopped instead of retrying\. Nothing was created\./);
});

test("exactly one controlled re-upload, on the first image error", () => {
  assert.match(route, /if \(imageErrors === 1\)/);
  assert.ok(!/attempt === 3/.test(route), "the old third-attempt re-upload is gone");
});

test("explicit rejections retry but ambiguous transport results reconcile", () => {
  assert.match(creation, /const retryable = isImageNotReady\(response.status, detail\) \|\| response.status === 429;/);
  assert.match(creation, /if \(response.status >= 500\)[\s\S]{0,130}return reconcileOrStop\(\)/);
  assert.match(creation, /const waits = \[3000, 7000, 15000, 20000, 30000, 45000\]/);
});

test("only definite failures release quota; ambiguous drafts keep their identity", () => {
  assert.match(route, /status IN \('running','uncertain'\)/);
  assert.doesNotMatch(route, /age>90_000|'-90 seconds'/);
  assert.match(route, /ON CONFLICT\(request_key\) DO UPDATE/);
  assert.match(route, /if\(prior&&prior.status!=="failed"\)return jobResponse\(prior,user.userId\)/);
  assert.match(route, /printify_draft_results.status='failed'/);
});
