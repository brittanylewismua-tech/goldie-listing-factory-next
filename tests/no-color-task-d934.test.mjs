import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D934: products without a Printify color axis do not render an empty color task",()=>{
  assert.match(source,/const rowProduct=isActive\?templateDetails:bundleColorProducts\[recipe\.id\]/);
  assert.match(source,/const hasColorAxis=rowProduct\?Boolean\(rowProduct\.colorOptions\?\.length\):recipe\.requiresColorSelection!==false/);
  assert.match(source,/\.\.\.\(hasColorAxis\?\[\{label:"Product colors"/);
});

test("D934: products with colors retain the post-draft color editor",()=>{
  assert.match(source,/if\(task==="draft-colors"&&templateDetails\)return/);
  assert.match(source,/<DraftColorSelector product=\{templateDetails\}/);
});
