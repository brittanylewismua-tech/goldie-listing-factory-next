/* D611 - the product family was read out of the SELLER'S nickname.

   productName was activeRecipe.name, with Printify's blueprint title only as a
   fallback, so a saved product called "Bestie Drop" or "Summer 2026" classified
   as nothing at all - and nothing at all fails quietly: the print-area bounds go
   permissive, the rendering mode falls to perspective, and every scene in the
   library is offered for every product.

   Requiring sellers to name products literally is not a fix. Printify already
   sends what the product IS. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const app = strip(await read("app/listing-factory-app.tsx"));
const compat = await read("app/mockup-compatibility.ts");

const module = await import("../app/mockup-compatibility.ts").catch(() => null);

test("the seller's own name never reaches classification", () => {
  assert.ok(!/productName=\{activeRecipe\?\.name/.test(app),
    "activeRecipe.name is a nickname, not a product description");
  assert.match(app, /productName=\{classifyingProductName\}/);
  assert.match(app, /const classifyingProductName = useMemo/);
  assert.match(app, /printifyProductLabel\(templateDetails\)/);
});

test("only strings Printify controls are used as a label", () => {
  const fn = strip(compat).slice(strip(compat).indexOf("export function printifyProductLabel"));
  const body = fn.slice(0, fn.indexOf("\n}") + 2);
  assert.match(body, /blueprintTitle.*brand.*model/s);
  assert.ok(!/recipe|nickname|setupName/i.test(body));
});

test("variant options identify the product without any name at all", async () => {
  if (!module) return; // type-only environments still get the source assertions above
  const { familyFromVariants } = module;
  assert.equal(familyFromVariants({ sizeOptions: [{ title: "S" }, { title: "2XL" }] }), "apparel");
  assert.equal(familyFromVariants({ sizeOptions: [{ title: "11oz" }, { title: "15 oz" }] }), "curved");
  assert.equal(familyFromVariants({ sizeOptions: [{ title: '8" x 10"' }, { title: "24×36" }] }), "flat");
  assert.equal(familyFromVariants({ sizeOptions: [{ title: "iPhone 16 Pro Max" }] }), "flat");
  assert.equal(familyFromVariants({ variants: [{ title: "Black / L" }] }), "apparel",
    "a variant title carries the size when there are no size options");
  assert.equal(familyFromVariants({}), "", "no evidence is not a guess");
});

test("a phone case is not read as a poster because it lists inches", async () => {
  if (!module) return;
  const { familyFromVariants } = module;
  assert.equal(familyFromVariants({ sizeOptions: [{ title: "iPhone 15" }, { title: '6.1" case' }] }), "flat");
});

test("structured evidence outranks any string", async () => {
  if (!module) return;
  const { productFamilyFromDetails } = module;
  // Printify's own title says tumbler; the variants say S/M/L. Trust the variants.
  assert.equal(productFamilyFromDetails({
    blueprintTitle: "Stainless Steel Tumbler", sizeOptions: [{ title: "M" }, { title: "XL" }],
  }), "apparel");
});

test("with no variants at all it still falls back to Printify's title", async () => {
  if (!module) return;
  const { productFamilyFromDetails } = module;
  assert.equal(productFamilyFromDetails({ blueprintTitle: "Unisex Heavy Cotton Tee" }), "apparel");
  assert.equal(productFamilyFromDetails({ blueprintTitle: "Ceramic Mug" }), "curved");
});
