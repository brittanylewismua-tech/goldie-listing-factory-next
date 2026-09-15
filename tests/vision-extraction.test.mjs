import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  costOf, parseExtraction, extractOnce, MAX_ATTEMPTS, CEILING_PER_SCAN,
} from "../app/vision-extraction.ts";
import { imageTokens } from "../app/design-normalize.ts";

/* The shape of a real extraction response, used by several tests. */
const GOOD = JSON.stringify({
  wording: ["MAMA NEEDS COFFEE"], typographyCategory: "distressed serif",
  layout: "stacked centered", illustrationCategory: "none",
  textToArtRatio: 1, dominantColors: ["#f2f0eb", "#2b2b2b"],
  compositionDensity: "medium", printAreaCoverage: 0.42,
  thumbnailReadability: "readable",
});

test("a complete response is accepted", () => {
  const parsed = parseExtraction(GOOD);
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.design.wording, ["MAMA NEEDS COFFEE"]);
});

test("a half-filled response is refused rather than stored", () => {
  const parsed = parseExtraction(JSON.stringify({ wording: ["HI"], layout: "centered" }));
  assert.equal(parsed.ok, false);
  assert.match(parsed.why, /missing fields/);
});

test("a fraction outside zero to one is refused", () => {
  const broken = JSON.parse(GOOD);
  broken.printAreaCoverage = 42;
  const parsed = parseExtraction(JSON.stringify(broken));
  assert.equal(parsed.ok, false);
  assert.match(parsed.why, /printAreaCoverage/);
});

test("JSON wrapped in prose is still read", () => {
  const parsed = parseExtraction(`Here is the analysis:\n\`\`\`json\n${GOOD}\n\`\`\`\nHope that helps.`);
  assert.ok(parsed.ok);
});

test("a design with no wording is valid, not an error", () => {
  const wordless = JSON.parse(GOOD);
  wordless.wording = [];
  wordless.textToArtRatio = 0;
  wordless.illustrationCategory = "hand-drawn floral";
  const parsed = parseExtraction(JSON.stringify(wordless));
  assert.ok(parsed.ok, "an illustration-only design was rejected");
  assert.deepEqual(parsed.design.wording, []);
});

test("one retry, and only after an unusable response", async () => {
  let calls = 0;
  const outcome = await extractOnce(async () => {
    calls += 1;
    return calls === 1
      ? { text: "I'm afraid I can't see an image.", usage: { input_tokens: 800, output_tokens: 20 } }
      : { text: GOOD, usage: { input_tokens: 800, output_tokens: 350 } };
  });
  assert.equal(calls, 2);
  assert.equal(outcome.attempts, 2);
  assert.ok(outcome.validJson);
  /* Both attempts were billed, so both are counted. */
  assert.ok(outcome.billedCost > costOf({ input_tokens: 800, output_tokens: 350 }));
});

test("a good first response is never followed by a second call", async () => {
  let calls = 0;
  const outcome = await extractOnce(async () => {
    calls += 1;
    return { text: GOOD, usage: { input_tokens: 800, output_tokens: 350 } };
  });
  assert.equal(calls, 1, "a second vision call was made after a valid first response");
  assert.equal(outcome.attempts, 1);
});

test("retries stop at the limit instead of looping on a broken model", async () => {
  let calls = 0;
  const outcome = await extractOnce(async () => {
    calls += 1;
    return { text: "nope", usage: { input_tokens: 800, output_tokens: 10 } };
  });
  assert.equal(calls, MAX_ATTEMPTS);
  assert.equal(outcome.validJson, false);
  assert.equal(outcome.design, null);
});

test("a scan stays under a cent on a cache MISS as well as a hit", () => {
  const image = imageTokens(768, 768);
  const prompt = 700;
  const output = 350;
  /* Cold: the prompt is written to cache at 2x, which is the worst case. */
  const miss = costOf({
    input_tokens: image, output_tokens: output, cache_creation_input_tokens: prompt });
  /* Warm: the same prompt is read at 0.1x. */
  const hit = costOf({
    input_tokens: image, output_tokens: output, cache_read_input_tokens: prompt });
  assert.ok(miss < CEILING_PER_SCAN, `cache miss costs ${miss.toFixed(5)}`);
  assert.ok(hit < CEILING_PER_SCAN, `cache hit costs ${hit.toFixed(5)}`);
  /* And under the preferred target, not merely the maximum. */
  assert.ok(miss < 0.01 && hit < 0.01);
  console.log(`      cache miss $${miss.toFixed(5)} / cache hit $${hit.toFixed(5)}`);
});

test("batch ingestion is billed at half", () => {
  const usage = { input_tokens: 800, output_tokens: 350 };
  assert.equal(costOf(usage, { batch: true }), costOf(usage) / 2);
});

test("nothing in the extraction path accepts a reference image", () => {
  const module = readFileSync(new URL("../app/vision-extraction.ts", import.meta.url), "utf8");
  /* Comments discuss the rule at length; the code is what has to obey it. */
  const code = module
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /reference|cohort|compare/i,
    "the single-call module referred to references; a fan-out could hide there");
  /* And it must take one image, not a list of them. */
  assert.doesNotMatch(code, /images\s*:/i);
});

test("the breaker reads measured cost and excludes ingestion", () => {
  const telemetry = readFileSync(new URL("../app/vision-telemetry.ts", import.meta.url), "utf8");
  assert.match(telemetry, /purpose = 'scan'/);
  assert.match(telemetry, /overCeiling/);
  /* Cost must come from recorded usage, never from a re-estimate. */
  assert.match(telemetry, /costOf\(entry\.usage/);
});
