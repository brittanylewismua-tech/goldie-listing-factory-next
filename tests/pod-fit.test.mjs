import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = name => readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8");
const { printable, madeOfSomethingElse, abovePrintableCeiling } =
  await import("../app/pod-fit.ts");

test("the imposters that reached the live board are excluded", () => {
  /* Etsy files both of these on shelves a printed product lives on. */
  assert.equal(printable({
    title: "Genuine Leather Shoulder Bags, Soft Cow Leather Tote",
    product: "Tote Bags", price: 212.66 }), false);
  assert.equal(printable({
    title: "Merino Wool Tank Top: Merino base layer shirt",
    product: "T-shirts", price: 64.99 }), false);
});

test("ordinary printed listings survive", () => {
  for (const row of [
    { title: "Retro Country Music Graphic Tee", product: "T-shirts", price: 21.99 },
    { title: "Custom Diecut Stickers Waterproof", product: "Stickers", price: 0.96 },
    { title: "Personalized Name Blanket", product: "Baby Blankets", price: 53.2 },
    { title: "Funny Coffee Mug for Coworker", product: "Mugs", price: 18.5 },
  ]) assert.equal(printable(row), true, `${row.title} must survive`);
});

test("the ceiling is per shelf, not one number", () => {
  /* A $120 blanket is ordinary. A $120 t-shirt is not a printed t-shirt. */
  assert.equal(abovePrintableCeiling("Blankets", 120), false);
  assert.equal(abovePrintableCeiling("T-shirts", 120), true);
});

test("an unpriced listing is not excluded for its price", () => {
  assert.equal(abovePrintableCeiling("T-shirts", null), false);
});

test("a shelf nobody has priced yet is not silently emptied", () => {
  /* A new shelf with no ceiling must fall back, not exclude everything. */
  assert.equal(abovePrintableCeiling("Something New", 40), false);
});

test("materials are matched as whole words", () => {
  /* Substring matching has already cost this codebase a seller — vin-TAG-e
     contains "tag". A rule that flags "silk" inside "silky" would start
     deleting real printed listings. */
  assert.equal(madeOfSomethingElse("Genuine Leather Tote"), true);
  assert.equal(madeOfSomethingElse("Leatherback Turtle Ocean Tee"), false);
  assert.equal(madeOfSomethingElse("Merino Wool Base Layer"), true);
  assert.equal(madeOfSomethingElse("Vintage Golf Decor Print"), false);
});

test("the rule is applied on the way in, not only on the way out", () => {
  /* A slot spent watching a leather handbag is a slot not spent on something
     printable. */
  const source = read("sold-overnight.ts");
  assert.match(source, /printable\(/, "discovery has to use it");
});
