import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css=fs.readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D924: each listing checkbox has a usable target rather than a bare 16px square",()=>{
  assert.match(css,/\.app-shell \.final-listing-select\{[^}]*min-width:32px;min-height:32px/);
});
