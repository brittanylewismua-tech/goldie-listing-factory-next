import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const tools=fs.readFileSync(new URL("../app/factory-tools.tsx",import.meta.url),"utf8");
const panel=fs.readFileSync(new URL("../app/factory-panel.tsx",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D886: a fresh product step shows the library and never chooses the first recipe",()=>{
  assert.match(tools,/const showLibrary=Boolean\(props\.showLibrary\)/);
  assert.match(tools,/reachable\.length > 0 && \(!activeId\|\|showLibrary\)/);
  assert.doesNotMatch(tools,/setActiveId\(recipes\[0\]/);
  assert.doesNotMatch(app,/setActiveRecipe\(recipes\[0\]/);
  assert.doesNotMatch(app,/localStorage\.getItem\("goldie-active-recipe"\)/,"a fresh page must not restore the previously used product");
  assert.doesNotMatch(app,/localStorage\.getItem\("goldie-active-bundle"\)/,"a fresh page must not restore the previously used bundle");
  assert.match(app,/restoreBatchById\(id,url\.searchParams\.get\("step"\)/,"an explicit saved-batch URL must still restore its product");
});

test("D886: the selected header uses the saved flatlay and owns its management",()=>{
  assert.match(app,/const photo=\(templateDetails\?pickProductPhoto\(templateDetails\):""\)\|\|activeRecipe\?\.previewImage/);
  assert.match(app,/const chosen=choice>=0\?shortlist\[choice\]:""/);
  assert.match(app,/previewImage:chosen/);
  assert.match(panel,/headerActions \? <div className="factory-panel-actions">/);
  assert.match(app,/headerActions=.*Choose a different product/);
  assert.doesNotMatch(tools,/selected-product-actions/);
});

test("D887: selected-product management disappears while the product library is open",()=>{
  assert.match(app,/headerActions=\{bundleCreationMode\?undefined:/);
  assert.match(app,/title=\{bundleCreationMode\?"Create a product bundle":showProductLibrary/);
  assert.match(app,/description=\{bundleCreationMode\?"Name it, then choose 2 to 4 products":showProductLibrary/);
});

test("D888: the empty picker does not repeat its state and shop metadata is quiet",()=>{
  const approved=fs.readFileSync(new URL("../app/approved-functional.css",import.meta.url),"utf8");
  assert.doesNotMatch(app, /: "No product selected"/);
  assert.match(app, /state=\{failedBundleNames\(\)\.length\?"Needs a look":undefined\}/);
  assert.match(tools, />Shop: \{recipeShopLabel\(recipe\)\}<\/small>/);
  assert.match(approved, /\.recipe-card \.recipe-copy \.recipe-shop\{[\s\S]{0,350}background:transparent!important/);
  assert.match(approved, /\.recipe-card \.recipe-copy \.recipe-shop\{[\s\S]{0,350}font-size:10px!important;font-weight:500!important/);
});

test("D889: cross-shop inventory adds no picker clutter",()=>{
  assert.doesNotMatch(tools,/recipe-other-store/);
  assert.doesNotMatch(tools,/Those publish to a different Etsy shop/);
  assert.doesNotMatch(app,/>Switch shop<\/a>/);
  assert.match(app,/sign-out\?return_to=%2Flisting-factory/);
  assert.doesNotMatch(app,/sign-out\?return_to=%2Flisting-factory%3Fstep%3Dconnect/);
  assert.match(app,/etsyShops\.length>0&&<div className="factory-account-shops"/);
  assert.match(css,/\.recipe-card \.bundle-card-heading\{margin-top:28px!important;margin-bottom:10px!important\}/);
  assert.match(css,/\.recipe-card \.unified-bundle-grid\{margin-top:0!important;margin-bottom:30px!important\}/);
});

test("D891: product and bundle selection use one card grid",()=>{
  assert.match(app,/title=\{bundleCreationMode\?"Create a product bundle":showProductLibrary/);
  assert.match(app,/headerActions=\{bundleCreationMode\?undefined:[\s\S]{0,240}>＋ Add a new product<\/button>[\s\S]{0,180}>Create a bundle<\/button>/);
  assert.match(app,/addProductRequest=\{addProductRequest\}/);
  assert.match(app,/bundleCreationAvailable&&<button type="button"[\s\S]{0,100}>Create a bundle<\/button>/);
  assert.match(tools,/className=\{`recipe-grid \$\{bundleForm\?"bundle-selection-grid":""\}`\}/);
  assert.match(tools,/if\(bundleForm\)\{setBundleIds\(/);
  assert.match(tools,/bundleForm&&inBundle\?<em>✓ Product \{bundleIds\.indexOf\(recipe\.id\)\+1\}<\/em>/);
  assert.match(tools,/className="bundle-builder"/);
  assert.doesNotMatch(tools,/className="bundle-library"/);
  assert.match(css,/\.bundle-selection-grid \.recipe-tile\.bundle-selected::after\{content:"✓"/);
});

test("D886: pricing waits for finished draft costs",()=>{
  assert.match(app,/ready\.facets\.filter\(facet=>facet\.name!=="profit"\)/);
  assert.match(app,/Final Printify production cost/);
  assert.match(app,/Approve final prices/);
});

test("D886: the workspace is white-grid paper and selection is green",()=>{
  assert.match(css,/--lf-paper:#fff/);
  assert.match(css,/\.color-choice-grid em,.app-shell \.size-choice-grid em\{background:#2f7a4b!important/);
  assert.match(css,/\.printify-photo-selector:has\(input:checked\)\{border-color:#2f7a4b!important;background:#2f7a4b!important/);
});
