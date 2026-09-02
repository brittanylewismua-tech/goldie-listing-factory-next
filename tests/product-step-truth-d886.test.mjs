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

test("D897: the selected header keeps the saved mockup and owns its management",()=>{
  assert.match(app,/const photo=activeRecipe\?\.previewImage\|\|\(templateDetails\?pickProductPhoto\(templateDetails\):""\)/);
  assert.doesNotMatch(app,/const chosen=choice>=0\?shortlist\[choice\]:""/);
  assert.match(panel,/headerActions \? <div className="factory-panel-actions">/);
  assert.match(app,/headerActions=.*Choose a different product/);
  assert.doesNotMatch(app,/>Remove from this batch<\/button>/);
  assert.doesNotMatch(app,/className="template-badge"/);
  assert.doesNotMatch(app,/: "1 product selected"/);
  assert.doesNotMatch(tools,/selected-product-actions/);
});

test("D887: selected-product management disappears while the product library is open",()=>{
  assert.match(app,/headerActions=\{bundleCreationMode\|\|productFormMode\?undefined:/);
  assert.match(app,/title=\{bundleCreationMode\?"Create a product bundle":productFormMode\?"Add a saved product":showProductLibrary/);
  assert.match(app,/description=\{bundleCreationMode\?"Name it, then choose 2 to 4 products":productFormMode\?"Connect one completed Printify product":showProductLibrary/);
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
  assert.match(app,/title=\{bundleCreationMode\?"Create a product bundle":productFormMode\?"Add a saved product":showProductLibrary/);
  assert.match(app,/headerActions=\{bundleCreationMode\|\|productFormMode\?undefined:[\s\S]{0,380}>＋ Add a new product<\/button>[\s\S]{0,220}>＋ Create a new bundle<\/button>/);
  assert.match(app,/addProductRequest=\{addProductRequest\}/);
  assert.match(app,/bundleCreationAvailable&&<button type="button" className="panel-create-action"[\s\S]{0,100}>＋ Create a new bundle<\/button>/);
  assert.equal((app.match(/className="panel-create-action"/g)||[]).length,4);
  assert.match(app,/>Choose a different bundle<\/button>/);
  assert.match(css,/\.factory-panel-actions \.panel-create-action\{[^}]*border:1px solid #cfc5cb[^}]*border-radius:8px[^}]*text-decoration:none/);
  assert.match(tools,/className=\{`recipe-grid \$\{bundleForm\?"bundle-selection-grid":""\}`\}/);
  assert.match(tools,/if\(bundleForm\)\{setBundleIds\(/);
  assert.match(tools,/bundleForm&&inBundle\?<em>✓ Product \{bundleIds\.indexOf\(recipe\.id\)\+1\}<\/em>/);
  assert.match(tools,/className="bundle-builder"/);
  assert.doesNotMatch(tools,/className="bundle-library"/);
  assert.match(css,/\.bundle-selection-grid \.recipe-tile\.bundle-selected::after\{content:"✓"/);
});

test("D894: similar products stay allowed while exact-looking setups require acknowledgment",()=>{
  assert.match(tools,/export function recipePlacementCue\(recipe: Recipe\)/);
  assert.match(tools,/return "Back print"/);
  assert.match(tools,/return "Front print"/);
  assert.match(tools,/export function bundleDuplicatePairs\(recipes: Recipe\[\]\)/);
  assert.match(tools,/sameTemplate\|\|sameSavedSetup/);
  assert.match(tools,/className="bundle-placement-cue"/);
  assert.match(tools,/className="bundle-duplicate-warning"/);
  assert.match(tools,/Keep both only if that is intentional/);
  assert.match(tools,/duplicatePairs\.length>0&&!duplicateAcknowledged/);
  assert.match(tools,/current\.includes\(recipe\.id\)\?current\.filter/,
    "the same saved product toggles out instead of being added twice");
  assert.doesNotMatch(tools,/same product type[^\n]*disabled/i,
    "two configurations of the same garment type must remain allowed");
  assert.match(css,/\.bundle-duplicate-warning\{[^}]*background:#fff4f6/);
});

test("D895: growing product libraries keep prominent, separated section headers",()=>{
  assert.match(css,/\.recipe-card \.recipe-library-head\{[^}]*margin:0 0 16px[^}]*padding:0 0 11px[^}]*border-bottom:1px solid #e5dde2/);
  assert.match(css,/\.recipe-card \.recipe-library-head>span\{[^}]*background:#2b2027[^}]*color:#fff[^}]*font:800 11px/);
  assert.match(css,/\.recipe-card \.bundle-card-heading\{margin-top:38px!important;margin-bottom:16px!important\}/);
});

test("D896: library headings describe the library, not a misleading item count",()=>{
  assert.match(tools,/<span>\{bundleForm\?"Products":"Saved products"\}<\/span>/);
  assert.match(tools,/bundle-card-heading"><span>Saved bundles<\/span>/);
  assert.doesNotMatch(tools,/reachable\.length} saved/);
  assert.doesNotMatch(tools,/usableBundles\.length} saved product/);
});

test("D886: pricing waits for finished draft costs",()=>{
  assert.match(app,/className="post-draft-shipping-review"/);
  assert.match(app,/Final Printify production cost/);
  assert.match(app,/Approve final prices/);
});

test("D886: the workspace is white-grid paper and selection is green",()=>{
  assert.match(css,/--lf-paper:#fff/);
  assert.match(css,/\.color-choice-grid em,.app-shell \.size-choice-grid em\{background:#2f7a4b!important/);
  assert.match(css,/\.printify-photo-selector:has\(input:checked\)\{border-color:#2f7a4b!important;background:#2f7a4b!important/);
});
