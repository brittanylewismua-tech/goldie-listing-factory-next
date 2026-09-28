import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const page=readFileSync("app/hot-list/page.tsx","utf8");
test("Hot List establishes the period before keyword search",()=>{
  assert.ok(page.indexOf('className="sold-windows"') < page.indexOf('className="hot-search"'));
  assert.equal((page.match(/className="sold-windows"/g)||[]).length,1);
  assert.match(page,/Loading sales and stock changes…/);
});
