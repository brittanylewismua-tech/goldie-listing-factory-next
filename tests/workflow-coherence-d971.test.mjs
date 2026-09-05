import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D971: listing photos are one job, not three disconnected rows",()=>{
  assert.match(app,/label:"Listing photos"[^\n]+task:"photos"/);
  assert.doesNotMatch(app,/label:"Final photo order"/);
  assert.doesNotMatch(app,/label:"Size guide"[^\n]+task:"sizeguide"/);
  const workspace=app.slice(app.indexOf('className="listing-photo-workspace"'),app.indexOf('className="listing-photo-workspace"')+5000);
  for(const component of ["PrintifyImagePicker","UploadedListingPhotos","IndividualSizeGuide","ListingPhotoOrder"])assert.match(workspace,new RegExp(component));
});

test("D971: Printify mockups use one compact grid with a complete expander",()=>{
  assert.doesNotMatch(app,/className="printify-view-groups"/);
  assert.match(app,/className="printify-image-grid printify-all-images"/);
  assert.match(app,/Show all \$\{images\.length\} Printify mockups/);
  assert.match(css,/\.printify-all-images\{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
});

test("D971: finished-cost pricing remains editable",()=>{
  assert.match(app,/aria-label="Edit item prices"/);
  assert.match(app,/PricingReview section="prices"/);
  assert.match(app,/Save these prices/);
  assert.match(app,/saveActualDraftPricing\(draft,editedPrices\)/);
});

test("D1106: sequential listing navigation does not overlay the editor with a tab grid",()=>{
  assert.doesNotMatch(app,/className="factory-listing-switch"/);
  assert.match(app,/className="factory-listing-next"/);
  assert.match(app,/Next listing →/);
  assert.match(app,/Previous listing/);
});
