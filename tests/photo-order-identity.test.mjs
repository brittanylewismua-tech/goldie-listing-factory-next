import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const order=fs.readFileSync(new URL("../app/listing-photo-order.tsx",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../app/approved-functional.css",import.meta.url),"utf8");

test("final photo order identifies the exact original design at a readable size",()=>{
  const branch=app.slice(app.indexOf('if(task==="order")'),app.indexOf("return null;",app.indexOf('if(task==="order")')));
  assert.match(branch,/ARRANGING PHOTOS FOR THIS DESIGN/);
  assert.match(branch,/design\.previewUrl/);
  assert.match(branch,/design\.name\|\|"Untitled design"/);
  assert.match(branch,/photo-order-design-identity/);
  assert.match(css,/listing-photo-design-identity\{[^}]*grid-template-columns:180px/);
  assert.match(css,/listing-photo-design-identity>img\{[^}]*width:180px;height:180px/);
});

test("every reorder tile names the actual photo as well as its source",()=>{
  assert.match(order,/className="photo-order-name" title=\{photo\.name\}>\{photo\.name\}/);
  assert.match(order,/photo\.kind==="uploaded"\?"Uploaded photo"/);
  assert.match(css,/photo-order-name\{[^}]*overflow-wrap:anywhere/);
});
