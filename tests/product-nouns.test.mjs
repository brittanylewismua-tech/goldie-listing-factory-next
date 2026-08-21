import { test } from "node:test";
import assert from "node:assert/strict";
import { excludedProductNouns, namesExcludedProduct, productFamily } from "../app/product-type-utils.ts";

/* Wrong-garment guard — D74.
 *
 * The original defect: a tee listing got the title "Bachelorette Koozies,
 * Bachelorette Coozies, Bachelorette Sash..." because the keyword bank mixed
 * party goods with apparel and nothing checked the product noun.
 *
 * The first fix matched whole words only, so "koozie" was blocked while
 * "koozies" — the form sellers actually write — passed. These tests pin the
 * plural forms specifically. */

const TEE = "Unisex Heavy Cotton Tee";
const excluded = excludedProductNouns(TEE);

test("the blueprint is recognised as a tee", () => {
  assert.equal(productFamily(TEE), "tee");
});

test("plural product nouns are rejected, not just singular — D74", () => {
  const mustReject = [
    "bachelorette koozie", "bachelorette koozies", "bachelorette coozies",
    "bachelorette sash", "bachelorette party sash",
    "bachelorette sunglasses", "bachelorette tapestry", "bachelorette tattoos",
    "camp bachelorette decor", "camp bachelorette decorations",
    "bride hoodie", "future mrs sweatshirt", "wifey sweatshirt",
  ];
  for (const phrase of mustReject) {
    assert.equal(namesExcludedProduct(phrase, excluded), true,
      `"${phrase}" names a product that is not a tee and must never reach a tee title.`);
  }
});

test("real tee phrases are never rejected", () => {
  const mustKeep = [
    "camp bachelorette shirt", "girls gone mild", "vegas bachelorette",
    "last splash", "she said yes", "fresh off the market",
    "bikinis and martinis", "going to the chapel", "coastal cowgirl bachelorette",
  ];
  for (const phrase of mustKeep) {
    assert.equal(namesExcludedProduct(phrase, excluded), false,
      `"${phrase}" is a valid tee phrase and must not be filtered out.`);
  }
});

test("each product family excludes the others but never itself", () => {
  for (const blueprint of ["Unisex Heavy Cotton Tee", "Unisex Hoodie", "Can Koozie", "Ceramic Mug"]) {
    const family = productFamily(blueprint);
    if (!family) continue;
    const list = excludedProductNouns(blueprint);
    assert.equal(namesExcludedProduct(blueprint, list), false,
      `"${blueprint}" excludes its own product noun — every phrase for it would be rejected.`);
  }
});

test("the keyword bank page and the title generator share one noun list — D90", async () => {
  const { readFile } = await import("node:fs/promises");
  const page = await readFile(new URL("../app/keywords/page.tsx", import.meta.url), "utf8");

  /* There used to be two denylists: a hand-written NON_SHIRT_PRODUCT regex on
   * this page, and PRODUCT_NOUN_GROUPS in product-type-utils. They disagreed —
   * the page blocked "koozies" on save while the generator let it into a title.
   * Two implementations of one rule always drift. */
  assert.doesNotMatch(page, /NON_SHIRT_PRODUCT/,
    "The page has its own product-noun regex again. It must read product-type-utils.");
  assert.match(page, /namesExcludedProduct\(word, ?SHIRT_EXCLUDED_NOUNS\)/);
  assert.match(page, /excludedProductNouns\("tee"\)/);

  // D91: a bank saved before the rule existed must be repairable in one click.
  assert.match(page, /className="strip-mismatched"/,
    "No way to remove wrong-product phrases. Save is disabled while they exist, so the bank is locked.");
});
