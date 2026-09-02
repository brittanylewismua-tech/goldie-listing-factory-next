import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const tools=fs.readFileSync(new URL("../app/factory-tools.tsx",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../app/approved-functional.css",import.meta.url),"utf8");

test("D885: bundle creation asks only which products belong in the bundle",()=>{
  const start=tools.indexOf('<div className="bundle-builder">');
  const end=tools.indexOf('<div className="recipe-library-head">',start);
  const form=tools.slice(start,end);
  assert.ok(start>0&&end>start,"bundle builder is present above the product cards");
  assert.doesNotMatch(form,/keyword bank|titles cannot be auto-written/i);
  assert.match(form,/Choose 2 to 4 products/);
  assert.doesNotMatch(css,/needs-bank-note/);
});
