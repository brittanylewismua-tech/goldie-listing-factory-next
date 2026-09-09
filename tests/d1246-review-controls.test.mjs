import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const review=readFileSync(new URL("../app/final-listing-review.tsx",import.meta.url),"utf8");
const footer=readFileSync(new URL("../app/factory-footer.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../app/lilac-theme.css",import.meta.url),"utf8");

test("D1246: Review names the exact missing item without tool jargon",()=>{
  assert.doesNotMatch(app,/Needs you/);
  assert.doesNotMatch(review,/Needs you/);
  for(const issue of ["No title yet.","No Etsy tags yet.","Finished cost needs price approval.","No listing photo selected."]){
    assert.ok(review.includes(issue));
  }
  assert.match(review,/\{issue\|\|"✓ Ready"\}/);
});

test("D1246: Etsy details remain automatic without a manual preparation control",()=>{
  assert.match(app,/Preparing Etsy details automatically…/);
  assert.doesNotMatch(app,/className="secondary-action prepare-etsy"/);
  assert.doesNotMatch(app,/>Prepare Etsy details</);
  assert.match(footer,/children\?: ReactNode/);
  assert.match(footer,/children == null \? null : forward/);
});

test("D1246: every reviewed product exposes its three edit destinations",()=>{
  for(const label of ["Artwork, colors &amp; sizes","Pricing &amp; shipping","Listing photos"]){
    assert.ok(review.includes(label));
  }
  assert.match(review,/onEditProduct\("design",items\[0\]\)/);
  assert.match(review,/onEditProduct\("pricing",items\[0\]\)/);
  assert.match(review,/onEditProduct\("photos",items\[0\]\)/);
  assert.match(app,/stage==="design"\?"placement":stage==="pricing"\?"draft-pricing":"photos"/);
  assert.match(app,/onEditProduct=\{editReviewedProduct\}/);
  assert.doesNotMatch(app,/function finalProductOverview\(/);
  assert.match(css,/\.recipe-product-settings/);
  assert.match(css,/@media\(max-width:560px\)[\s\S]*?\.recipe-product-settings\{display:grid/);
});
