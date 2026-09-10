import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D1269: focused Review navigation replaces the work surface for all listing-detail sections",()=>{
  assert.match(app,/const focusedSection=reviewEditing\?\.clientId===design\.id\?\(reviewEditing\.section\|\|"title"\):null/);
  assert.match(app,/focusedSection==="title"\?titlesRows\(design\)/);
  assert.match(app,/:focusedSection==="description"\?descriptionRows\(design\)/);
  assert.match(app,/:focusedSection==="etsy"\?etsyRows\(design\)/);
  assert.match(app,/focused-review-\$\{focusedSection\}/);
});

test("D1269: an Etsy destination with no title shows its waiting state instead of disappearing",()=>{
  assert.match(css,/\.focused-review-grid>\.factory-etsy-details-column:has\(\.etsy-detail-pending\)\{display:block\}/);
  assert.match(app,/Waiting for this listing’s title\./);
});

test("D1269: focused Review headings and photo counts describe the selected listing",()=>{
  assert.match(app,/const focusedReviewSummary=reviewEditing\?`Listing \$\{Math\.max\(1,files\.findIndex/);
  assert.match(app,/const focusedPhotoDraft=isActive&&reviewEditing\?\.section==="photos"/);
  assert.match(app,/const focusedPhotoCount=focusedPhotoDraft\?\.id\?\(printifyImageSelections\[focusedPhotoDraft\.id\]\?\?printifyImageIndices\)\.length/);
  assert.match(app,/const listingPhotoCount=focusedPhotoCount\?\?\(counts\.photos\+counts\.mockups\)/);
});
