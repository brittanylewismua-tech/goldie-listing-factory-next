import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const order=fs.readFileSync(new URL("../app/listing-photo-order.tsx",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D1063 makes the entire reorder strip a forgiving drop surface",()=>{
  assert.match(order,/onDragOver=\{trackDrag\} onDrop=/);
  assert.match(order,/querySelectorAll<HTMLElement>\("\[data-photo-id\]"\)/);
  assert.match(order,/Math\.hypot/);
  assert.match(order,/move\(source,nearest\.card\.dataset\.photoId\|\|"",after\)/);
});

test("D1063 uses sequential listing navigation for colors and returns to the top",()=>{
  assert.doesNotMatch(app,/className="draft-design-picker"/);
  assert.match(app,/className="factory-listing-next draft-color-next"/);
  assert.match(app,/selectorRef\.current\?\.scrollIntoView\(\{block:"start"\}\)/);
  assert.match(app,/source.closest\(".factory-listing-screen"\)\?\.querySelector<HTMLElement>\(".factory-listing-grid"\)/);
  assert.match(app,/editor\?\.scrollIntoView\(\{block:"start"\}\)/);
});

test("D1063 renders the mockup expander as a horizontal row and gives navigation real padding",()=>{
  assert.match(css,/printify-image-picker \.printify-more-toggle\{[\s\S]{0,500}width:100%!important/);
  assert.match(css,/printify-more-toggle svg\{[\s\S]{0,180}width:14px!important/);
  assert.match(css,/factory-listing-next button\{padding:10px 18px!important/);
});
