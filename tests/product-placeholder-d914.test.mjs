import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("an unresolved product never masquerades as a T-shirt",()=>{
  const glyph=app.slice(app.indexOf("function ProductGlyph"),app.indexOf("import { publishedDaysThisPeriod"));
  assert.match(glyph,/productFamily\(name\)/);
  assert.match(glyph,/family==="mug"/);
  assert.match(glyph,/family==="tumbler"/);
  assert.match(glyph,/family==="tote"/);
  assert.match(glyph,/family==="poster"/);
  assert.match(glyph,/family==="sticker"/);
  assert.match(glyph,/product-glyph-\$\{family\|\|"other"\}/);
  assert.match(glyph,/!garment&&!\['mug','tumbler','tote','poster','sticker'\]\.includes\(family\)/);
});

test("the true loading state stays neutral while Printify identifies the product",()=>{
  assert.match(app,/product-photo-loading" aria-label="Loading product photo"><span className="goldie-spinner"/);
});
