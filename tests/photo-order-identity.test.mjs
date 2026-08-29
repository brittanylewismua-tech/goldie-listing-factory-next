import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const order=fs.readFileSync(new URL("../app/listing-photo-order.tsx",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../app/approved-functional.css",import.meta.url),"utf8");

test("final photo order identifies the exact original design at a readable size",()=>{
  /* D709 · Uploading and ordering merged into one panel, so this reads the
     photos panel now. The rule is unchanged: the thing identifying which listing
     you are arranging must be the LISTING's own Printify photo at a size you can
     judge, not the design's upload filename. */
  const branch=app.slice(app.indexOf('if(task==="lifestyle")return <>'),app.indexOf("return null;",app.indexOf('if(task==="lifestyle")return <>')));
  /* D684 - this block used to show the DESIGN artwork under the design's upload
     filename. Brittany: "if that could be the actual printify listing there
     instead of just showing the design... And don't show the title of the design."
     She is arranging the listing's photos, so the thing identifying the listing
     has to be the listing's own Printify photo, named as a listing. */
  assert.match(branch,/PHOTOS FOR THIS LISTING<\/span>/);
  assert.doesNotMatch(branch,/PHOTOS FOR THIS DESIGN/);
  assert.match(branch,/draft\.previewUrl\|\|design\.previewUrl/);
  assert.match(branch,/listingLabel\(design\)/);
  // The upload filename must not come back as the heading.
  assert.doesNotMatch(branch,/design\.name\|\|"Untitled design"/);
  /* D709 · One identity block per listing now, not one per panel. It heads
     both the uploader and the order grid, so it carries the photo count. */
  assert.match(branch,/listing-photo-design-identity/);
  assert.match(branch,/in this listing/);
  // Readable size: 180px was too small to judge. 240px, and it stays square.
  assert.match(css,/listing-photo-design-identity\{[^}]*grid-template-columns:240px/);
  assert.match(css,/listing-photo-design-identity>img\{[^}]*width:240px;height:240px/);
});

test("every reorder tile names the actual photo as well as its source",()=>{
  assert.match(order,/className="photo-order-name" title=\{photo\.name\}>\{photo\.name\}/);
  assert.match(order,/photo\.kind==="uploaded"\?"Uploaded photo"/);
  assert.match(css,/photo-order-name\{[^}]*overflow-wrap:anywhere/);
});
