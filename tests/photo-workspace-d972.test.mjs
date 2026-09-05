import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const rows=fs.readFileSync(new URL("../app/listing-rows.tsx",import.meta.url),"utf8");
const order=fs.readFileSync(new URL("../app/listing-photo-order.tsx",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");
const legacy=fs.readFileSync(new URL("../app/approved-functional.css",import.meta.url),"utf8");

test("D972: the photo workspace shows one listing at a time with navigation at its foot",()=>{
  assert.match(app,/<ListingRows defaultOpen singleOpen focusedKey=\{photoFocusId\} rows=/);
  assert.match(rows,/singleOpen \? rows\.slice\(0, 1\)/);
  assert.match(rows,/← Previous listing/);
  assert.match(rows,/Next listing →/);
});

test("D972: size guide and photo ordering are explicit, consistent controls",()=>{
  assert.match(order,/className="photo-order-heading"><b>Photo order<\/b>/);
  assert.match(css,/\.listing-photo-workspace \.individual-size-guide>button\{[^}]*background:#111/);
  assert.match(css,/\.listing-photo-workspace \.listing-photo-order\{[^}]*background:transparent/);
  assert.match(css,/\.listing-card-pagination>button:last-child\{[^}]*background:#111/);
  assert.doesNotMatch(legacy,/individual-size-guide button\{[^}]*background:[^}]*!important/);
});
