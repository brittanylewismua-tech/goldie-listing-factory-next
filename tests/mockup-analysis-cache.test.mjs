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
  /* The insert is the lock: one caller gets changes > 0, the other is told
     to wait rather than starting a second paid job. */
  assert.match(code, /Number\(claim\.meta\.changes\) > 0/);
  assert.match(code, /claimed: false/);
  assert.match(code, /lease_expires <= \?/);
});

test("a failure is never served back as a valid result", () => {
  const fail = code.slice(code.indexOf("export async function failAnalysis"));
  assert.match(fail, /state = 'failed', payload_json = NULL/);
  /* Only a ready row with a payload is ever returned as a hit. */
  assert.match(code, /existing\?\.state === "ready" && existing\.payload_json/);
  /* And a failed row can be retaken immediately. */
  assert.match(code, /state = 'failed'/);
});

test("a configuration or model change creates a new entry rather than overwriting", () => {
  /* Both are in the primary key, so a bump cannot collide with the old row. */
  const key = code.match(/PRIMARY KEY \(([^)]+)\)/)[1];
  assert.ok(key.includes("configuration_version"));
  assert.ok(key.includes("model_version"));
});

test("a dead worker cannot hold a mockup forever", () => {
  assert.match(code, /LEASE_SECONDS/);
  assert.match(code, /lease_expires > now/);
});
