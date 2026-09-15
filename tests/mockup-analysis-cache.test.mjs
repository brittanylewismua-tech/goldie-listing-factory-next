/*
  The cache guarantees, checked against the SQL that implements them.
  These cannot run the real D1, so the statements themselves are the subject.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const module = readFileSync(
  new URL("../app/mockup-analysis-cache.ts", import.meta.url), "utf8");
const code = module.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("identity is content plus operation plus versions, never the URL", () => {
  assert.match(code,
    /PRIMARY KEY \(user_id, source_image_hash, operation, configuration_version, model_version\)/);
  /* A URL anywhere in the key would pay twice for the same bytes moved. */
  assert.doesNotMatch(code, /url|src|href/i);
});

test("print-area and segmentation cache separately", () => {
  assert.match(code, /PRINT_AREA_CONFIG_VERSION/);
  assert.match(code, /SEGMENTATION_CONFIG_VERSION/);
  assert.match(code, /operation = \?/);
});

test("members never share a cached analysis", () => {
  for (const statement of code.match(/WHERE user_id[\s\S]*?`/g) ?? [])
    assert.match(statement, /user_id = \?/);
  assert.match(code, /user_id TEXT NOT NULL/);
});

test("simultaneous identical requests reserve exactly one provider job", () => {
  /* The conditional write is the lock: one caller changes a row, the other
     is told to poll rather than starting a second paid job. The behaviour
     itself is exercised in tests/mockup-analysis-policy.test.mjs. */
  assert.match(code, /Number\(claimed\.meta\.changes\) > 0/);
  assert.match(code, /action: "pending"/);
});

test("a failure is never served back as a valid result", () => {
  const fail = code.slice(code.indexOf("export async function failAnalysis"));
  assert.match(fail, /payload_json = NULL/);
  /* Spaced by backoff and counted, never retried on the next request. */
  assert.match(fail, /next_attempt_at = \?/);
  assert.match(fail, /nextAttemptAt\(/);
  assert.match(fail, /settleFailure/);
});

test("every write is fenced by the generation the worker claimed", () => {
  for (const name of ["storeAnalysis", "failAnalysis", "reopenAnalysis"]) {
    const body = code.slice(code.indexOf(`export async function ${name}`));
    assert.match(body.slice(0, 1200), /AND generation = \?/,
      `${name} can write without owning the claim`);
  }
});

test("the claim is conditioned on the generation that was read", () => {
  const claim = code.slice(code.indexOf("export async function claimAnalysis"));
  assert.match(claim, /WHERE \$\{WHERE_KEY\} AND generation = \?/);
  assert.match(claim, /DO NOTHING/);
  assert.match(claim, /action: "pending"/);
});

test("a configuration or model change creates a new entry rather than overwriting", () => {
  /* Both are in the primary key, so a bump cannot collide with the old row. */
  const key = code.match(/PRIMARY KEY \(([^)]+)\)/)[1];
  assert.ok(key.includes("configuration_version"));
  assert.ok(key.includes("model_version"));
});

test("a dead worker cannot hold a mockup forever", () => {
  /* The lease lives in the policy module, which the behavioural tests drive
     end to end; here it only has to be the thing the cache consults. */
  assert.match(code, /decide\(row, now\)/);
});
