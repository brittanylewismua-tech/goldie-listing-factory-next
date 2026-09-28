import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const css=readFileSync("app/platform-updates.css","utf8");
test("Updates platform filter is centered beneath the page title",()=>{
  assert.match(css,/\.pu-head\{\s*display:grid!important;/s);
  assert.match(css,/\.pu-tabs\{\s*margin-left:auto!important;\s*margin-right:auto!important;/s);
});
