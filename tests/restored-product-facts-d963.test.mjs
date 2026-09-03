import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

test("D963: restored Etsy properties cannot override facts proven by the Printify product", () => {
  assert.match(app, /function restoreAuthoritativeProductFacts\(design:DesignFile,template:TemplateDetails\|null,recipe\?:Recipe\|null\):DesignFile/);
  assert.match(app, /properties=\(design\.etsy\.properties\|\|\[\]\)\.map\(property=>facts\[property\.label\]\?\{\.\.\.property,value:facts\[property\.label\]\}:property\)/);
  assert.match(app, /attributes:\{\.\.\.design\.etsy\.attributes,\.\.\.facts\},properties/);
  assert.match(app, /return restoreAuthoritativeProductFacts\([\s\S]{0,420}state\.templateDetails\|\|null,state\.activeRecipe\)/);
});

test("D963: long-sleeved product words are resolved before tee words", () => {
  const defaults = app.slice(app.indexOf("function productEtsyDefaults"), app.indexOf("function restoreAuthoritativeProductFacts"));
  assert.ok(defaults.indexOf("sweatshirt") < defaults.indexOf("\\bt-?shirt\\b"));
  assert.match(defaults, /derived\["Sleeve length"\]="Long sleeve"/);
});
