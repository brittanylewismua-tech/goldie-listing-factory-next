import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const create=readFileSync(new URL("../app/api/printify/drafts/route.ts",import.meta.url),"utf8");
const update=readFileSync(new URL("../app/api/printify/drafts/update/route.ts",import.meta.url),"utf8");

test("D904: the saved template supplies the initial draft variants",()=>{
  assert.match(app,/templateColors=.*templateEnabled/);
  assert.match(app,/remembered\.length\?remembered:session\.length\?session:templateColors/);
  assert.match(app,/templateSizes=.*templateEnabled/);
  assert.match(app,/rememberedSizes\.length\?rememberedSizes:sessionSizeIds\.length\?sessionSizeIds:templateSizes/);
  assert.match(app,/selectedVariantIds:pricedVariants\.map\(variant=>variant\.id\)/);
  assert.match(create,/Array\.isArray\(body\.selectedVariantIds\)\?body\.selectedVariantIds\.includes\(id\):is_enabled/);
});

test("D904: color decisions happen after real Printify mockups exist",()=>{
  assert.match(app,/function DraftColorSelector/);
  assert.match(app,/REAL PRINTIFY PREVIEW/);
  assert.match(app,/task:"draft-colors"/);
  assert.match(app,/className="post-draft-shipping-review"/);
  assert.doesNotMatch(app,/ready\.facets\.filter\(facet=>facet\.name!=="profit"\)/);
});

test("D904: Printify image variant metadata survives creation and refresh",()=>{
  for(const source of [create,update]){
    assert.match(source,/variant_ids\?:number\[\]/);
    assert.match(source,/printifyImageDetails/);
    assert.match(source,/variantIds:image\.variant_ids\|\|\[\]/);
  }
  assert.match(app,/printifyMockupForColor\(draft\.printifyImageDetails,variants\)/);
});

test("D904: changing colors updates owned private drafts, never Etsy",()=>{
  const sync=app.slice(app.indexOf("async function syncDraftVariantChoices"),app.indexOf("async function syncListingFields"));
  assert.match(sync,/\/api\/printify\/drafts\/update/);
  assert.match(sync,/selectedVariantIds/);
  assert.doesNotMatch(sync,/\/api\/etsy|publish/i);
  assert.match(update,/if\(body\.selectedVariantIds\)/);
  assert.match(update,/is_enabled:chosen\.has\(variant\.id\)/);
  assert.match(update,/That Printify draft was not created by this Listing Factory account/);
});
