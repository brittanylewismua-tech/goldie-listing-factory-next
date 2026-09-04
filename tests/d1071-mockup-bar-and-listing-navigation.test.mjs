import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css=fs.readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");
const clarity=fs.readFileSync(new URL("../app/clarity-pass.css",import.meta.url),"utf8");
const rows=fs.readFileSync(new URL("../app/listing-rows.tsx",import.meta.url),"utf8");

test("D1071 mockup expander is a full-width horizontal bar in its real owner",()=>{
  assert.match(css,/\.printify-image-picker \.printify-more-toggle\{[^}]*display:flex!important[^}]*width:100%!important[^}]*min-height:44px!important/);
  assert.match(css,/\.printify-image-picker \.printify-more-toggle svg\{[^}]*width:14px!important[^}]*height:14px!important/);
  assert.doesNotMatch(css,/\.task-panel \.printify-more-toggle\{/);
});

test("D1071 listing pagination opens and scrolls to the next listing header",()=>{
  assert.match(rows,/const openListing = \(index: number\)/);
  assert.match(rows,/CSS\.escape\(row\.key\)/);
  assert.match(rows,/scrollIntoView\(\{ block: "start" \}\)/);
  assert.match(rows,/onClick=\{\(\) => openListing\(index \+ 1\)\}/);
  assert.match(rows,/onClick=\{\(\) => openListing\(index - 1\)\}/);
  assert.match(clarity,/\.listing-card-head\[data-listing-row\]\{scroll-margin-top:72px\}/);
});
