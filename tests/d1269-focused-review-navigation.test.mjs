import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D1269: focused Review navigation replaces the work surface for all listing-detail sections",()=>{
  assert.match(app,/const focusedSection=reviewEditing\?\.clientId===design\.id\?\(reviewEditing\.section\|\|"title"\):null/);
  assert.match(app,/focusedSection==="title"\?titlesRows\(undefined,true\)/);
  assert.match(app,/:focusedSection==="description"\?descriptionRows\(undefined,true\)/);
  assert.match(app,/:focusedSection==="etsy"\?etsyRows\(design\)/);
  assert.match(app,/focused-review-\$\{focusedSection\}/);
});

test("D1269: an Etsy destination with no title shows its waiting state instead of disappearing",()=>{
  assert.match(css,/\.focused-review-grid>\.factory-etsy-details-column:has\(\.etsy-detail-pending\)\{display:block\}/);
  assert.match(app,/Waiting for this listing’s title\./);
  assert.match(app,/Open Title &amp; tags, add the title, then return here\./);
  assert.doesNotMatch(app,/Create the title above to prepare the Etsy category/);
});

test("D1269: focused Review headings and photo counts describe the selected listing",()=>{
  assert.match(app,/const focusedReviewSummary=reviewEditing\?`Listing \$\{Math\.max\(1,files\.findIndex/);
  assert.match(app,/const focusedPhotoDraft=isActive&&reviewEditing\?\.section==="photos"/);
  assert.match(app,/const focusedPhotoCount=focusedPhotoDraft\?\.id\?\(printifyImageSelections\[focusedPhotoDraft\.id\]\?\?printifyImageIndices\)\.length/);
  assert.match(app,/const listingPhotoCount=focusedPhotoCount\?\?\(counts\.photos\+counts\.mockups\)/);
});

test("D1270: reload restores the exact listing and section instead of dropping into an arbitrary editor",()=>{
  assert.match(app,/url\.searchParams\.set\("listing",clientId\)/);
  assert.match(app,/url\.searchParams\.set\("section",section\)/);
  assert.match(app,/const draft=drafts\.find\(item=>item\.clientId===clientId&&item\.id\)/);
  assert.match(app,/setReviewEditing\(\{id:draft\.id,clientId,section\}\)/);
  assert.match(app,/url\.searchParams\.delete\("listing"\)/);
  assert.match(app,/url\.searchParams\.delete\("section"\)/);
});
