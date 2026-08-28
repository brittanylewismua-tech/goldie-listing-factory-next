import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const order=fs.readFileSync(new URL("../app/listing-photo-order.tsx",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../app/approved-functional.css",import.meta.url),"utf8");

test("final photo order identifies the exact original design at a readable size",()=>{
  const branch=app.slice(app.indexOf('if(task==="order")'),app.indexOf("return null;",app.indexOf('if(task==="order")')));
  /* D684 - this block used to show the DESIGN artwork under the design's upload
     filename. Brittany: "if that could be the actual printify listing there
     instead of just showing the design... And don't show the title of the design."
     She is arranging the listing's photos, so the thing identifying the listing
     has to be the listing's own Printify photo, named as a listing. */
  assert.match(branch,/ARRANGING PHOTOS FOR/);
  assert.doesNotMatch(branch,/ARRANGING PHOTOS FOR THIS DESIGN/);
  assert.match(branch,/draft\.previewUrl\|\|design\.previewUrl/);
  assert.match(branch,/listingLabel\(design\)/);
  // The upload filename must not come back as the heading.
  assert.doesNotMatch(branch,/design\.name\|\|"Untitled design"/);
  assert.match(branch,/photo-order-design-identity/);
  // Readable size: 180px was too small to judge. 240px, and it stays square.
  assert.match(css,/listing-photo-design-identity\{[^}]*grid-template-columns:240px/);
  assert.match(css,/listing-photo-design-identity>img\{[^}]*width:240px;height:240px/);
});

test("every reorder tile names the actual photo as well as its source",()=>{
  assert.match(order,/className="photo-order-name" title=\{photo\.name\}>\{photo\.name\}/);
  assert.match(order,/photo\.kind==="uploaded"\?"Uploaded photo"/);
  assert.match(css,/photo-order-name\{[^}]*overflow-wrap:anywhere/);
});
