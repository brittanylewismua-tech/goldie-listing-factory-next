import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  familyCopyKey, missingFamilies, parseFamilyCopy, fallbackCopy,
} from "../app/family-copy.ts";

const FAMILIES = ["tee", "hoodie", "crewneck", "tank", "longSleeve"];
const fallback = family => fallbackCopy(family, family, ["MAMA NEEDS COFFEE"]);

test("the cache key ignores the order families arrived in", () => {
  const base = { userId: "u1", artworkHash: "a1", designVersion: "v1" };
  assert.equal(
    familyCopyKey({ ...base, families: ["tee", "mug"] }),
    familyCopyKey({ ...base, families: ["mug", "tee"] }));
});

test("a different member never reads another member's copy", () => {
  const base = { artworkHash: "a1", designVersion: "v1", families: FAMILIES };
  assert.notEqual(
    familyCopyKey({ ...base, userId: "u1" }),
    familyCopyKey({ ...base, userId: "u2" }));
});

test("re-extracting a design invalidates its copy", () => {
  const base = { userId: "u1", artworkHash: "a1", families: FAMILIES };
  assert.notEqual(
    familyCopyKey({ ...base, designVersion: "v1" }),
    familyCopyKey({ ...base, designVersion: "v2" }));
});

test("only the missing families are requested", () => {
  assert.deepEqual(
    missingFamilies(FAMILIES, ["tee", "hoodie", "crewneck"]),
    ["longSleeve", "tank"]);
  assert.deepEqual(missingFamilies(FAMILIES, FAMILIES), []);
});

test("a complete batched response is read per family", () => {
  const text = JSON.stringify(Object.fromEntries(FAMILIES.map(family =>
    [family, { blurb: `A ${family} blurb.`, optionalFields: { Holiday: "Christmas" } }])));
  const result = parseFamilyCopy(text, FAMILIES, fallback);
  assert.equal(Object.keys(result.copy).length, 5);
  assert.equal(result.fellBack.length, 0);
  assert.equal(result.copy.tee.optionalFields.Holiday, "Christmas");
});

test("one bad family falls back without costing the others", () => {
  const text = JSON.stringify({
    tee: { blurb: "A tee blurb." },
    hoodie: { blurb: "" },
    crewneck: { blurb: "A crewneck blurb." },
  });
  const result = parseFamilyCopy(text, FAMILIES, fallback);
  assert.equal(result.copy.tee.blurb, "A tee blurb.");
  /* hoodie came back empty, tank and longSleeve never came back at all. */
  assert.deepEqual(result.fellBack.sort(), ["hoodie", "longSleeve", "tank"]);
  assert.deepEqual(result.invalid, ["hoodie"]);
  for (const family of FAMILIES)
    assert.ok(result.copy[family].blurb.length > 0, `${family} has no copy at all`);
});

test("an unparseable response still yields copy for every family", () => {
  const result = parseFamilyCopy("the model apologised", FAMILIES, fallback);
  assert.equal(result.fellBack.length, 5);
  for (const family of FAMILIES) assert.ok(result.copy[family].blurb.length > 0);
});

test("fallback copy invents no optional fields", () => {
  const copy = fallbackCopy("tee", "t-shirt", ["MAMA NEEDS COFFEE"]);
  assert.match(copy.blurb, /MAMA NEEDS COFFEE/);
  assert.match(copy.blurb, /t-shirt/);
  assert.deepEqual(copy.optionalFields, {},
    "fallback copy guessed an optional field rather than leaving it empty");
});

test("a non-string optional value is dropped, not stringified", () => {
  const text = JSON.stringify({ tee: { blurb: "ok", optionalFields: { Holiday: 5, Occasion: "Birthday" } } });
  const result = parseFamilyCopy(text, ["tee"], fallback);
  assert.deepEqual(result.copy.tee.optionalFields, { Occasion: "Birthday" });
});

test("nothing retries a single family on its own", () => {
  const code = readFileSync(new URL("../app/family-copy.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  /* A per-family retry would rebuild the fan-out this replaced. */
  assert.doesNotMatch(code, /retry|attempt/i);
  assert.doesNotMatch(code, /fetch\(/);
});
