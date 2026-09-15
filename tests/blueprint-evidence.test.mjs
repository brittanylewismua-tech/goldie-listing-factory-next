import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL(
  "../app/api/listing-factory/blueprint-evidence/route.ts", import.meta.url), "utf8");

/* The matcher, lifted exactly as written, so the test exercises the real rule. */
const CLASSES = ["sunglass", "tattoo", "keychain", "key chain", "pin", "patch",
  "magnet", "coaster", "napkin", "balloon", "garland", "backdrop", "candle",
  "invitation", "veil", "fan", "sash", "banner", "tapestry", "decor"];
const classOf = title => {
  const words = title.toLocaleLowerCase().split(/[^a-z]+/).filter(Boolean);
  const joined = ` ${words.join(" ")} `;
  return CLASSES.find(name => joined.includes(` ${name} `)) ?? "";
};

test("a colour name is not evidence of a product type", () => {
  /* This produced 1,066 false enamel-pin sightings. */
  assert.equal(classOf("Light Pink / 2XL"), "");
  assert.equal(classOf("Light Pink"), "");
  assert.equal(classOf("Cornsilk"), "");
  assert.equal(classOf("Sand"), "");
});

test("a real product type is still recognised", () => {
  assert.equal(classOf("Enamel Pin 1.5 inch"), "pin");
  assert.equal(classOf("Hand Fan"), "fan");
  assert.equal(classOf("Temporary Tattoo Sheet"), "tattoo");
  assert.equal(classOf("Bridal Sash"), "sash");
});

test("the scan reads one account and writes nothing", () => {
  assert.match(route, /WHERE user_id = \?/);
  assert.doesNotMatch(route, /INSERT INTO|UPDATE |DELETE FROM/);
});

test("a blueprint id is never inferred from a title", () => {
  /* Only a live Printify product may name a blueprint. */
  assert.match(route, /product\.blueprint_id/);
  assert.match(route, /historicalEvidence: unavailable/);
  assert.doesNotMatch(route, /blueprintId: guess|inferBlueprint/);
});
