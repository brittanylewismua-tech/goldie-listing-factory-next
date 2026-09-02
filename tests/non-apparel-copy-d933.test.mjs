import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const app=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("the design step describes the product's real print areas instead of assuming apparel",()=>{
  assert.match(app,/assign artwork to the print areas this product supports/);
  assert.doesNotMatch(app,/assign front and back artwork where needed/);
});

test("the uploaded design uses neutral primary-artwork copy when Printify's side name is misleading",()=>{
  assert.match(app,/<em>Primary artwork<\/em>/);
  assert.doesNotMatch(app,/Primary artwork · \{printSideLabel\(primarySide\)\}/);
  assert.doesNotMatch(app,/Primary \{printSideLabel\(primarySide\).*?artwork/);
});
