import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { navigationIssues } from "../app/workflow-gates.ts";

test("keeps both connected-account Disconnect actions visually quiet", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/approved-functional.css", import.meta.url), "utf8"),
  ]);
  assert.equal((page.match(/className="disconnect-link"/g) || []).length, 3);
  assert.match(css, /service-row>button:not\(\.disconnect-link\)/);
  assert.match(css, /connection-row>button\.disconnect-link\{width:auto!important;min-width:0!important;max-width:none!important;background:transparent!important/);
});

test("shows which products use each keyword bank and blocks wrong-product phrases", async () => {
  const page = await readFile(new URL("../app/keywords/page.tsx", import.meta.url), "utf8");
  assert.match(page, /Used by:/);
  assert.match(page, /Fix wrong-product phrases before saving/);
  // Was NON_SHIRT_PRODUCT — a second hand-written regex that had drifted from
  // the list the title generator uses. Both now read product-type-utils (D90).
  assert.match(page, /namesExcludedProduct\(word, ?SHIRT_EXCLUDED_NOUNS\)/);
  assert.match(page, /disabled=\{!name\.trim\(\)\|\|!words\.length\|\|saving\|\|mismatchedWords\.length>0\}/);
});

test("uses the binding batch limit and keeps setup actions in the right hierarchy", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/approved-functional.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /up to \$\{batchDesignLimit\} finished designs/);
  assert.match(page, /Add up to \$\{batchDesignLimit\} designs in this batch/);
  assert.doesNotMatch(page, /Your folder can contain up to 20 designs/);
  assert.match(css, /recipe-library-head \.add-product-button\{border:0!important;background:transparent!important/);
  assert.match(css, /managementOnly \.newSetButton\{border:0!important;background:transparent!important/);
});

test("places the selected-product proof before bundle setup and exposes Finish phases after drafts", async () => {
  const [app, tools] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/factory-tools.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(app, /selectedSummary=\{templateDetails\?</);
  assert.match(tools, /\{activeId&&<div className="selected-summary-block">[\s\S]*<details className="bundle-library"/);
  /* D220 retired the Finish node and its four-phase subrail. The workflow is now
     four stages - Product, Images, Listing, Publish - and the phases that used to
     nest under Finish were merged onto those pages: draft creation and mockups
     onto Images, Etsy details alongside titles on Listing. */
  assert.match(app, /const RAIL_STAGES: Array<\{label:string;title:string;index:number;covers:number\[\]\}>/);
  assert.doesNotMatch(app, /className="rail-substeps"/, "no nested subrail remains");
});

test("shows a trial subscriber the trial end date instead of the monthly reset date", async () => {
  const usage = await readFile(new URL("../app/usage/page.tsx", import.meta.url), "utf8");
  assert.match(usage, /plan\.key==="trial"&&data\.billing\?\.subscription\?\.status==="trialing"/);
  assert.match(usage, /`Trial ends \$\{new Date\(data\.billing\.subscription\.currentPeriodEnd\*1000\)/);
});

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("serves the Listing Factory from its canonical product path", async () => {
  const response = await render();
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "/listing-factory");
  const pageSource = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  const globalCss = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const approvedCss = await readFile(new URL("../app/approved-functional.css", import.meta.url), "utf8");
  assert.match(pageSource, /Goldie Listing Factory/);
  assert.match(pageSource, /Connect Printify/);
  assert.match(pageSource, /Secure connection/);
  assert.match(pageSource, /Prepare your product in Printify/);
  assert.match(pageSource, /The term &apos;Etsy&apos; is a trademark of Etsy, Inc\./);
  assert.match(pageSource, /not endorsed or certified by Etsy, Inc\./);
  assert.match(approvedCss, /\.etsy-api-disclosure/);
  assert.match(pageSource, /How to get your Printify token/);
  assert.match(pageSource, /token connects the whole Printify account/);
  assert.match(globalCss, /@media\(max-width:650px\).*\.top-nav\{flex-wrap:wrap;white-space:normal/s);
  assert.doesNotMatch(pageSource, /pink-dorm-collage|rich-man-poster|cowgirl-disco|newest batch will open/i);
  assert.doesNotMatch(pageSource, /codex-preview|react-loading-skeleton/i);
});

test("offers real account sign-in choices and preserves the selected destination", async () => {
  const response = await render("/account/sign-in?return_to=%2Fmastermind");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Sign in to your Listing Factory/);
  assert.match(html, /Continue with Google/);
  assert.match(html, /Email me a sign-in link/);
  assert.match(html, /Continue with ChatGPT/);
  assert.match(html, /No password to remember/);
  assert.match(html, /return_to=%2Fmastermind/);

  const [client, auth, callback, signout] = await Promise.all([
    readFile(new URL("../app/account/sign-in/sign-in-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/chatgpt-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/auth/callback/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/account/sign-out/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(client, /signInWithOAuth\(\{ provider: "google"/);
  assert.match(client, /signInWithOtp/);
  assert.match(client, /className="account-footer"/);
  assert.match(auth, /supabase:/);
  assert.match(auth, /accountSignInPath/);
  assert.match(callback, /exchangeCodeForSession/);
  assert.match(signout, /auth\.signOut/);
});

test("uses individual shop-aware Printify editor buttons", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/drafts/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Open in Printify to resize or reposition/);
  assert.match(page, /Clear this listing’s selections/);
  assert.match(page, /openedDrafts/);
  assert.match(page, /window\.open\(draft\.editorUrl/);
  assert.doesNotMatch(page, /printifyTab\.location|\/app\/store\/\$\{draft\.shopId\}/);
  assert.doesNotMatch(page, /openLatestBatch|Open .* drafts in Printify/);
  assert.match(route, /shopId: shop\.id/);
  assert.match(page, /MAX_BATCH_FILES = 20/);
  assert.doesNotMatch(page, /MAX_BATCH_BYTES|Reduce it to 500 MB/);
  assert.match(page, /LARGE_BATCH_THRESHOLD = 400 \* 1024 \* 1024/);
  assert.doesNotMatch(page, /new Worker|OffscreenCanvas|UPNG/);
  assert.match(page, /analyzePadding/);
  assert.match(page, /MAX_CONCURRENT_DESIGNS = 2/);
  assert.match(page, /\$\{processed\} of \$\{runTotal\} complete/);
  assert.match(page, /\{processed\}\/\{runTotal\}/);
  assert.doesNotMatch(page, /Creating \$\{processed \+ 1\} of/);
  assert.match(page, /\/api\/printify\/stage/);
  assert.match(page, /prepareArtworkFile/);
  assert.match(page, /fetchWithDeadline/);
  assert.match(page, /4 \* 60 \* 1000/);
  assert.match(page, /Add at least one design/);
  assert.match(page, /title: design\.title \|\| undefined/);
  assert.doesNotMatch(page, /listingTitle/);
  assert.match(route, /body\.title\?\.trim\(\)\.slice\(0, 255\) \|\| body\.fileName/);
  assert.match(page, /Choose or add a saved product/);
  assert.match(page, /function startOver\(\)/);
  assert.match(page, /Clear batch \+ start over/);
  assert.match(page, /Switch to “\$\{recipe\.name\}” and start a new batch/);
  assert.match(page, /clearCurrentBatch\(false\)/);
  assert.match(page, /folderPicker\.current\.value = ""/);
  assert.match(page, /imagePicker\.current\.value = ""/);
  assert.match(page, /function openAllDrafts\(\)/);
  assert.match(page, /Wait\. Your files are still uploading/);
  assert.match(page, /Leaving now may stop the unfinished uploads/);
  assert.doesNotMatch(page, /className="upload-guard"/);
  assert.match(page, /Design uploads still in progress may stop before their Printify drafts are finished/);
  assert.match(page, /setUploadNoticeOpen\(true\)/);
  assert.match(page, /beforeunload/);
  assert.match(page, /Review all listings in Printify/); // D151: real DOM label, was a CSS ::after
  assert.match(page, /drafts\.map/);
  assert.match(page, /Allow pop-ups for this site/);
  assert.match(route, /response\.status === 429/);
  assert.match(route, /response\.status >= 500/);
  assert.match(route, /three automatic retries/);
  assert.match(page, /clientId: design\.id/);
  assert.match(page, /failedIds\.has\(file\.id\)/);
  assert.match(page, /key=\{draft\.clientId\}/);
  assert.doesNotMatch(page, /\.tif|tiff\?/i);
  assert.match(page, /aria-label="Open Goldie Diagnostics"/);
  assert.match(page, /owner && <a className="diagnostics-link"/);
  assert.doesNotMatch(page, /className="help-button"|aria-label="Open help"/);
  assert.match(page, /all scopes/);
  assert.match(page, /friendlyUploadError/);
  assert.match(page, /8253\|Provided images do not exist/);
  assert.match(page, /Download it fully to your computer/);
  assert.match(page, /const waits = \[0, 1500, 4000\]/);
  assert.match(route, /stagedIdForCleanup/);
  assert.match(route, /finally/);
  assert.match(route, /printAreasWithOnlyCurrentArtwork/);
  assert.doesNotMatch(route, /image\.id === primaryTemplateImageId/);
  assert.match(route, /Add one placeholder design/);
  assert.match(route, /templateImageCount/);
});

test("unifies saved products, editing, pricing, and mockups without the old factory toggle", async () => {
  const [page, recipes, mockups, drafts] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/factory-tools.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/integrated-mockups.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/drafts/route.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(page, /factory-switcher/);
  assert.match(recipes, /Printify product link/);
  assert.match(recipes, /Goldie imports the variations, placement, shipping, costs, and description/);
  assert.match(recipes, /saved product/);
  assert.match(recipes, /Add a new product/);
  /* D169: saving a product no longer selects it — creating and choosing are
   * different intentions. The seller returns to the list and picks deliberately. */
  assert.match(recipes, /Product saved\. Choose it below when you want to build with it\./);
  assert.doesNotMatch(recipes, /onUseRecipe\(saved\)/);
  /* D169: saving no longer auto-selects, so this asserts the opposite now.
   * onUseRecipe is still the path used when the seller taps Choose. */
  assert.doesNotMatch(recipes, /props\.onUseRecipe\(saved\)/);
  assert.match(recipes, /props\.onUseRecipe\(recipe\)/);
  assert.doesNotMatch(page, /Adjust what changed\. Keep everything else\./);
  assert.match(page, /Saved for this product/);
  assert.match(page, /Saved for this product — remove or add any scene/);
  assert.doesNotMatch(page, />Not chosen</);
  assert.doesNotMatch(recipes, /Shipping cost|Shipping charged|Payment fixed fee/);
  assert.doesNotMatch(page, /Apply titles in order|Import title CSV/);
  assert.match(recipes, /validated phrases available to Goldie/);
  assert.match(page, /Exact title phrases/);
  assert.match(page, /300 DPI recommended/);
  /* D214: renamed and opened by default. It was a closed <details> reading
     "Choose Printify flatlays", so a seller who never found it published with
     no product photographs at all. */
  assert.match(page, /Printify product photos — \{selected\.size\} selected/);
  assert.match(page, /IntegratedMockups/);
  assert.match(mockups, /Choose a mockup set/);
  assert.match(mockups, /Create .*mockups/);
  assert.match(drafts, /approved>=Number\(cost\?\?price\)/);
  assert.match(drafts, /finalPrice/);
  assert.doesNotMatch(drafts, /template\.shippingByVariant\?\.\[id\]/);
  assert.match(page, /Buyer-paid shipping is handled separately/);
  assert.match(drafts, /printifyImages/);
});

test("groups equal-cost Printify variants while preserving individual review and starts new products blank", async () => {
  const [page, recipes, printify] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/factory-tools.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Item prices \+ buyer-paid shipping/);
  assert.match(page, /variant\.templatePrice/);
  assert.match(page, /Lowest estimated item profit/);
  assert.match(page, /Shipping not included/);
  assert.match(page, /normalizePricesByCost/);
  assert.match(page, /changeCostGroupPrice/);
  assert.match(page, /grouped\.set\(variant\.cost/);
  assert.match(page, /item\.cost===cost/);
  assert.match(page, /exact same Printify product cost/);
  assert.match(page, /color, size, material, finish, capacity, or model stays in a separate group/);
  assert.doesNotMatch(page, /Sizes and colors shown below/);
  assert.match(page, /edit one separately/i);
  assert.doesNotMatch(page, /Approve pricing \+ shipping/);
  assert.match(page, /Continue to create drafts/);
  assert.match(page, /Approve prices and shipping/);
  assert.doesNotMatch(page, /onApprovalChange\(Boolean\(selectedProfile&&!customDirty\)\)/);
  assert.match(page, /variantPrices/);
  assert.match(page, /pricingApproved/);
  assert.match(printify, /variants:selectableVariants\.map/);
  assert.match(printify, /colorOptions:/);
  assert.match(recipes, /onStartNewProduct/);
  assert.match(page, /function startNewProduct/);
  assert.match(page, /clearCurrentBatch\(true\)/);
  assert.doesNotMatch(page, /staged for all/);
});

test("provides thorough contextual help throughout all nine Listing Factory steps", async () => {
  const [page, help, css] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/context-help.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /const WORKFLOW_HELP = \[/);
  assert.match(page, /WORKFLOW_HELP\[progressIndex\]/);
  assert.match(page, /Connect Printify and Etsy/);
  assert.match(page, /Prepare your product in Printify/);
  assert.match(page, /still only a Printify draft will not work/);
  assert.match(page, /Copy the correct Printify URL/);
  assert.match(page, /Add finished artwork/);
  assert.match(page, /Review prices and shipping/);
  assert.match(page, /Create the Printify drafts/);
  assert.match(page, /Create titles, tags, and descriptions/);
  assert.match(page, /Review Etsy details/);
  assert.match(page, /Choose and arrange listing images/);
  assert.match(page, /Complete the final review/);
  assert.match(page, /Explain item pricing/);
  assert.match(page, /Explain shipping profiles/);
  assert.match(help, /aria-haspopup="dialog"/);
  assert.match(help, /event\.key === "Escape"/);
  assert.match(help, /role="dialog"/);
  assert.match(help, /className="context-help-close"/);
  assert.match(help, /createPortal/);
  assert.match(help, /document\.body/);
  assert.match(help, /document\.body\.style\.overflow = "hidden"/);
  assert.doesNotMatch(help, />Got it</);
  assert.match(css, /\.context-help-trigger/);
  assert.match(css, /\.context-help-dialog/);
});

test("keeps Finish guidance, title actions, tags, and flatlays visually unambiguous",async()=>{
  const [clarity,approved]=await Promise.all([
    readFile(new URL("../app/clarity-pass.css",import.meta.url),"utf8"),
    readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8"),
  ]);
  assert.match(approved,/\.finish-guide:before/);
  assert.match(approved,/\.finish-guide span\{[^}]*border:0[^}]*background:transparent/);
  assert.match(clarity,/\.individual-title-builder > summary \{[\s\S]*text-decoration: none/);
  assert.match(approved,/\.draft-card-top \.tag-row\{[\s\S]*overflow-y:scroll/);
  assert.match(approved,/\.tag-row::-webkit-scrollbar-thumb/);
  assert.match(approved,/\.image-pref-actions\+div/);
});

test("anchors Printify selectors to each photo and keeps batch actions honest",async()=>{
  const [page,approved,mockups]=await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8"),
    readFile(new URL("../app/integrated-mockups.tsx",import.meta.url),"utf8"),
  ]);
  assert.match(page,/className="printify-image-grid"/);
  assert.match(page,/className="printify-photo-selector"/);
  assert.match(page,/Select a Printify photo below first/);
  assert.match(approved,/\.printify-image-grid \.printify-image-option\{position:relative/);
  assert.match(approved,/\.printify-photo-selector\{position:absolute!important/);
  assert.match(approved,/\.mockup-product-warning\{display:none!important\}/);
  assert.doesNotMatch(mockups,/className="mockup-product-warning"/);
});

test("stages each finished mockup group for its exact Etsy listing", async () => {
  const [mockups,images,page] = await Promise.all([
    readFile(new URL("../app/integrated-mockups.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/etsy/images/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(mockups, /productId/);
  assert.match(mockups, /stageForEtsy/);
  assert.match(mockups, /form\.set\("replace","true"\)/);
  assert.doesNotMatch(mockups, /kind=mockup`,\{method:"DELETE"/);
  assert.match(mockups, /added automatically when this listing publishes/);
  assert.doesNotMatch(mockups, /zipSync/);
  assert.match(images, /etsy-listing-images/);
  assert.match(images, /kind==="size-guide"/);
  assert.match(images, /existing\.objects\.map\(object=>runtime\(\)\.ARTWORK\.delete\(object\.key\)\)/);
  assert.match(images, /catch\(error\)\{await Promise\.all\(saved\.map/);
  assert.match(page, /Add one size guide to every Etsy listing/);
  assert.match(page, /printifyImageIndices/);
});

test("renders Mockup Library as management only", async () => {
  const response = await render("/mockups");
  const html = await response.text();
  /* D267 · The eyebrow already reads MOCKUP LIBRARY and the nav item is
     "Mockup Library"; the h1 repeated it a third time on one screen. It names
     the content now, matching Keyword Banks ("Your keyword banks"). */
  assert.match(html, /<h1>Your mockup sets<\/h1>/);
  assert.match(html, /MOCKUP LIBRARY/);
  assert.match(html, /Add mockup set/);
  assert.match(html, /class="management-nav"/);
  assert.match(html, />Listing Factory<\/a>/);
  assert.doesNotMatch(html, /mockupFooter/);
  assert.doesNotMatch(html, /Add this design/);
  assert.doesNotMatch(html, /Create your mockups/);
});

test("guides sellers through the complete resumable nine-step workflow",async()=>{
  const [page,batches,route,cache,styles]=await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/batches/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/batches/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/batch-cache.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/globals.css",import.meta.url),"utf8"),
  ]);
  assert.match(page,/Connect Printify/);assert.match(page,/Choose product/);assert.match(page,/Add designs/);assert.match(page,/Review pricing/);assert.match(page,/Create drafts/);assert.match(page,/Titles, tags \+ descriptions/);assert.match(page,/Etsy listing details/);assert.match(page,/Images \+ mockups/);assert.match(page,/Final review/);
  assert.match(page,/searchParams\.get\("batch"\)/);assert.doesNotMatch(page,/const id=window\.localStorage\.getItem\("goldie-active-batch"\)/);
  assert.match(page,/aria-current=\{active\?"step"/);assert.match(page,/progressStatus/);assert.match(page,/designs ready/);assert.match(page,/Ready to publish/);assert.match(page,/Complete the prior step/);
  assert.match(page,/goldie-active-batch/);assert.match(page,/saveBatchFiles/);assert.match(page,/\/api\/batches/);
  assert.match(batches,/Continue where you left off/);assert.match(batches,/Resume batch/);assert.match(route,/listing_batches/);assert.match(cache,/indexedDB/);
  assert.match(styles,/post-draft-workspace \.open-all-button\{width:auto/);
  assert.match(page,/saveAllEtsyDetails/);assert.match(page,/finishPhase/);
  assert.match(page,/etsyPreparationActive\.current/);
  assert.match(page,/etsySaveActive\.current/);
  assert.match(page,/url\.searchParams\.set\("phase","final"\)/);
  assert.match(page,/version!==etsyPreparationVersion\.current/);
});

test("imports Printify product facts and automatically prepares product-specific Etsy details",async()=>{
  const [page,printify,intelligence,drafts]=await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/printify/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/listing-intelligence/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/printify/drafts/route.ts",import.meta.url),"utf8"),
  ]);
  assert.match(printify,/blueprintTitle/);assert.match(printify,/description:found\.product\.description/);
  assert.match(page,/Completing Etsy details/);assert.match(page,/Etsy details completed/);
  assert.match(page,/finalDescription/);assert.match(page,/descriptionOverride/);
  assert.match(intelligence,/fields differ/);assert.match(intelligence,/include every physical or product attribute you can confidently support/i);assert.match(intelligence,/Do not stop at required fields/);assert.match(intelligence,/Fill holiday, occasion, recipient, or style only when/);assert.match(intelligence,/Never guess simply to make a field non-empty/);
  assert.match(drafts,/template\.description/);
});

test("imports shipping and keeps final listing edits attached to the exact Printify draft",async()=>{
  const [page,printify,update]=await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/printify/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/printify/drafts/update/route.ts",import.meta.url),"utf8"),
  ]);
  assert.match(printify,/shipping\.json/);assert.match(printify,/standardShipping/);
  assert.match(page,/Create titles for the whole batch/);
  assert.match(page,/api\/printify\/drafts\/update/);
  assert.match(page,/syncListingFields/);
  assert.match(page,/function syncPreparedListing/);
  assert.match(page,/syncedListingSignatures/);
  assert.match(update,/json_extract\(response_json,'\$\.id'\)/);
  assert.match(update,/method:"PUT"/);
  assert.match(update,/filter\(placeholder=>placeholder\.images\?\.some\(image=>image\.id\)\)/);
  assert.doesNotMatch(update,/\.\.\.area,placeholders/);
  assert.match(update,/placementScale=Math\.max/);
  assert.match(page,/Open in Printify to resize or reposition/);
});

test("matches Printify editor DPI instead of comparing against template pixel dimensions", async () => {
  const { normalizedPlacementScale, printifyDpi } = await import("../app/print-quality.ts");
  assert.deepEqual(printifyDpi(5000, 7200, 1.126), { dpi: 185, level: "Medium" });
  assert.deepEqual(printifyDpi(8100, 7200, 1.125), { dpi: 300, level: "High" });
  assert.equal(normalizedPlacementScale(1, { left: .25, right: .75 }), 2);
  assert.deepEqual(printifyDpi(7200, 7200, normalizedPlacementScale(1, { left: .25, right: .75 })), { dpi: 150, level: "Medium" });
  assert.equal(normalizedPlacementScale(1, { left: .06, right: .94 }, 1), 1);
  assert.deepEqual(printifyDpi(6144, 7200, normalizedPlacementScale(1, { left: .06, right: .94 }, 1)), { dpi: 256, level: "Medium" });
  assert.deepEqual(printifyDpi(6144, 7200, Math.min(1.125, 1)), { dpi: 256, level: "Medium" });
  const page = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  assert.match(page, /maxPlacementScale:isRigidPaperProduct\(templateDetails\)\?1:undefined/);
  assert.doesNotMatch(page, /Target:\s*\{templateDetails/);
  assert.match(page, /DPI · good to print/);
});

test("calculates every Printify variant price from its own cost and Etsy fee profile", async () => {
  const { estimatedProfit, recommendedPrice } = await import("../app/pricing.ts");
  const pricing = { targetProfit: 10, etsyFeePercent: 9.5, fixedFee: 0.25, listingFee: 0.20, shippingCost: 0, shippingCharged: 0 };
  assert.equal(recommendedPrice(1034, pricing), 2298);
  assert.equal(recommendedPrice(1184, pricing), 2463);
  assert.equal(recommendedPrice(1760, pricing), 3100);
  assert.equal(recommendedPrice(1034), 1034);
  assert.equal(recommendedPrice(1000, { targetProfit: 10, etsyFeePercent: 10, fixedFee: .25, listingFee: .20, shippingCost: 5, shippingCharged: 5 }), 2273);
  assert.equal(recommendedPrice(1000, { targetProfit: 10, etsyFeePercent: 9.5, fixedFee: .25, listingFee: .20, shippingCost: 6, shippingCharged: 3 }), 2260);
  assert.equal(recommendedPrice(1000, { targetProfit: 10, etsyFeePercent: 9.5, fixedFee: .25, listingFee: .20, shippingCost: 4, shippingCharged: 3 }), 2260);
  assert.equal(recommendedPrice(1000, { targetProfit: 0, etsyFeePercent: 9.5, fixedFee: .25, listingFee: .20, shippingCost: 6, shippingCharged: 3 }), 1155);
  const overCollectedShipping = { targetProfit: 10, etsyFeePercent: 9.5, fixedFee: .25, listingFee: .20, shippingCost: 4, shippingCharged: 6 };
  assert.equal(recommendedPrice(1000, overCollectedShipping), 2260);
  assert.ok(estimatedProfit(2260, 1000, overCollectedShipping) >= 10);
  assert.ok(estimatedProfit(2260, 1000, overCollectedShipping) < 10.02);
  assert.equal(estimatedProfit(2800,979,{...pricing,shippingCost:4.75,shippingCharged:4.75}),estimatedProfit(2800,979,{...pricing,shippingCost:7.99,shippingCharged:7.99}),"identical product costs and prices always show identical item profit");
  const crewneck = { targetProfit: 10, etsyFeePercent: 9.5, fixedFee: .25, listingFee: .20, shippingCost: 11.49, shippingCharged: 25 };
  const crewneckPrice = recommendedPrice(3100, crewneck);
  assert.ok(estimatedProfit(crewneckPrice, 3100, crewneck) >= 10);
  assert.ok(estimatedProfit(crewneckPrice, 3100, crewneck) < 10.02);
  const page = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  const drafts = await readFile(new URL("../app/api/printify/drafts/route.ts", import.meta.url), "utf8");
  assert.match(page, /stillUsingTemplatePrices/);
  assert.match(page, /Goldie calculated every price from your profit goal, product costs, and Etsy fees\./);
  assert.match(page, /if\(profile\)recalculate\(pricing\)/);
  assert.doesNotMatch(page, /estimatedProfit\([^\n]+shippingCost/);
  assert.doesNotMatch(drafts, /shipping==null\?body\.pricing/);
});

test("processes a 20-design batch with bounded two-at-a-time concurrency", async () => {
  const [page, boundedSource] = await Promise.all([readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"), readFile(new URL("../app/bounded-work.ts", import.meta.url), "utf8")]);
  assert.match(page, /const MAX_BATCH_FILES = 20/);
  assert.match(page, /const MAX_CONCURRENT_DESIGNS = 2/);
  assert.match(page, /async function processDesign/);
  assert.match(page, /runBounded\(targetFiles, batchConcurrency, processDesign/);
  assert.match(page, /batchBytes>LARGE_BATCH_THRESHOLD\?1:MAX_CONCURRENT_DESIGNS/);
  assert.match(page, /setProcessed\(Math\.min\(completedDesignIds\.size,targetFiles\.length\)\)/);
  assert.match(boundedSource, /Math\.min\(limit, items\.length\)/);
  const { runBounded } = await import("../app/bounded-work.ts");
  let active = 0;
  let maximumActive = 0;
  const completed = [];
  await runBounded(Array.from({ length: 20 }, (_, index) => index), 2, async (item) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, item % 2 ? 2 : 1));
    active -= 1;
    return item;
  }, (item) => completed.push(item));
  assert.equal(maximumActive, 2);
  assert.equal(completed.length, 20);
  assert.deepEqual([...completed].sort((a, b) => a - b), Array.from({ length: 20 }, (_, index) => index));
});

test("preflights the account once and reuses a protected batch session", async () => {
  const [page, connection, drafts, schema, migration] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/drafts/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0004_broad_dazzler.sql", import.meta.url), "utf8"),
  ]);
  assert.match(connection, /printify_batch_sessions/);
  assert.match(connection, /Enable at least one size or color/);
  assert.match(connection, /Place one design in every print area/);
  assert.match(connection, /Publish this product to Etsy once with the shipping profile/);
  assert.match(connection, /expiresAt = Math\.floor\(Date\.now\(\) \/ 1000\) \+ 6 \* 60 \* 60/);
  assert.match(page, /batchId: templateDetails\?\.batchId/);
  assert.match(drafts, /FROM printify_batch_sessions WHERE id = \? AND user_id = \?/);
  assert.doesNotMatch(drafts, /const shops = await api|for \(const candidate of shops\)/);
  assert.match(schema, /printifyBatchSessions/);
  assert.match(migration, /printify_batch_sessions/);
});

test("makes draft retries idempotent so a lost response cannot duplicate a listing", async () => {
  const [drafts, schema, migration] = await Promise.all([
    readFile(new URL("../app/api/printify/drafts/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0004_broad_dazzler.sql", import.meta.url), "utf8"),
  ]);
  assert.match(drafts, /SHA-256/);
  assert.match(drafts, /prior\?\.status === "succeeded"/);
  assert.match(drafts, /status = 'succeeded'/);
  assert.match(drafts, /still completing this exact draft/);
  assert.match(drafts, /async function handleGET\(request: Request\)/);
  const page = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  assert.match(page, /async function recoverDraft/);
  assert.match(page, /status === "succeeded"/);
  assert.match(schema, /printifyDraftResults/);
  assert.match(migration, /printify_draft_results/);
});

test("uses draft creation as the authoritative image-readiness check", async () => {
  const [route, creation] = await Promise.all([readFile(new URL("../app/api/printify/drafts/route.ts", import.meta.url), "utf8"), readFile(new URL("../app/api/printify/product-creation.ts", import.meta.url), "utf8")]);
  assert.doesNotMatch(route, /waitForUploadedImage|fetch\(`\$\{PRINTIFY_API\}\/uploads\/\$\{encodeURIComponent\(imageId\)\}/);
  assert.match(route, /draft creation[\s\S]*authoritative registration check/i);
  assert.match(creation, /Provided images do not exist/);
  assert.match(creation, /8253/);
  assert.match(route, /createProductWithImageRetries/);
  assert.match(creation, /3000, 7000, 15000, 20000, 30000, 45000/);
  assert.match(route, /attempt === 3/);
});

test("retries Printify remote-artwork download interruptions before failing the design", async () => {
  const drafts = await readFile(new URL("../app/api/printify/drafts/route.ts", import.meta.url), "utf8");
  assert.match(drafts, /10300/);
  assert.match(drafts, /image download/);
  assert.match(drafts, /remoteDownloadInterrupted/);
  assert.match(drafts, /after three automatic retries/);
});

test("sends optimized staged artwork directly to Printify", async () => {
  const route = await readFile(new URL("../app/api/printify/drafts/route.ts", import.meta.url), "utf8");
  assert.match(route, /ARTWORK\?\.get\(body\.stagedId\)/);
  assert.match(route, /contents = await artworkContents/);
  assert.match(route, /file_name: body\.fileName!, contents/);
});

test("parses real eRank exports and creates Etsy-valid title phrases", async () => {
  const { phrasesFromErank, tagsFromTitle, titlesFromCsv } = await import("../app/seo-utils.ts");
  assert.deepEqual(phrasesFromErank('Keyword,Searches,Competition\n"western wall art",1240,43000\n"pink dorm poster",720,18000'), ["western wall art", "pink dorm poster"]);
  assert.deepEqual(tagsFromTitle("Bachelorette Girls Gone Mild, Girls Gone Mild, Fresh Off The Market Bachelorette, Fresh Off The Market, Bride Crew"), ["girls gone mild", "fresh off the market", "bride crew"]);
  assert.deepEqual(tagsFromTitle("Fresh Off The Market Bachelorette"), [], "long bank phrases must remain title-only, never split into fabricated tags");
  assert.deepEqual(titlesFromCsv('Title,Searches\n"Western Art, Cowgirl Decor",200\n"CEO Office Art",100'), ["Western Art, Cowgirl Decor", "CEO Office Art"]);
});

test("rejects wrong garment nouns using the exact Printify blueprint", async () => {
  const intelligence = await readFile(new URL("../app/api/listing-intelligence/route.ts", import.meta.url), "utf8");
  const { excludedProductNouns, namesExcludedProduct } = await import("../app/product-type-utils.ts");
  assert.match(intelligence, /excludedProductNouns\(body\.product\?\.blueprintTitle/);
  assert.match(intelligence, /titleCandidates=keywords\.filter\(keyword=>!namesExcludedProduct\(keyword,excludedNouns\)\)/);
  const teeExclusions = excludedProductNouns("Unisex Heavy Cotton Tee | Gildan 5000");
  assert.equal(namesExcludedProduct("Wifey Sweatshirt", teeExclusions), true);
  assert.equal(namesExcludedProduct("Future Mrs Sweatshirt", teeExclusions), true);
  assert.equal(namesExcludedProduct("Bride Hoodie", teeExclusions), true);
  assert.equal(namesExcludedProduct("Bride T Shirt", teeExclusions), false);
  const hoodieExclusions = excludedProductNouns("Unisex Heavy Blend Hooded Sweatshirt");
  assert.equal(namesExcludedProduct("Bride Shirt", hoodieExclusions), true);
  assert.equal(namesExcludedProduct("Bride Hoodie", hoodieExclusions), false);
});

test("uses the full Mockup Library width and previews up to ten scenes before expansion — D83", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/mockups/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/mockups/management.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /items\.slice\(0,10\)/);
  assert.match(css, /\.managementSetList\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /\.managementSetList \.setPreview\s*\{[\s\S]*grid-template-columns:\s*repeat\(5, minmax\(120px, 1fr\)\)/);
  assert.match(css, /\.managementSetList \.setPreview img\s*\{[\s\S]*aspect-ratio:\s*4 \/ 5/);
});

test("validates and isolates staged artwork without decoding or buffering it", async () => {
  const [stage, drafts, cryptoSource] = await Promise.all([
    readFile(new URL("../app/api/printify/stage/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/drafts/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/token-crypto.ts", import.meta.url), "utf8"),
  ]);
  assert.match(stage, /request\.body\.tee\(\)/);
  assert.match(stage, /validateImageHeader/);
  assert.doesNotMatch(stage, /request\.arrayBuffer\(\)/);
  assert.match(stage, /customMetadata: \{ owner: user\.userId/);
  assert.match(stage, /removeExpiredArtwork/);
  assert.match(drafts, /customMetadata\?\.owner !== user\.userId/);
  assert.match(drafts, /customMetadata\?\.expires/);
  assert.match(cryptoSource, /\^\[a-f0-9\]\{64\}\$/i);
  assert.match(cryptoSource, /iv\.length !== 12/);
  const { encryptPrintifyToken, decryptPrintifyToken } = await import("../app/api/printify/token-crypto.ts");
  const secret = "ab".repeat(32);
  const encrypted = await encryptPrintifyToken("printify-secret-token", secret);
  assert.notEqual(encrypted, "printify-secret-token");
  assert.equal(await decryptPrintifyToken(encrypted, secret), "printify-secret-token");
  await assert.rejects(decryptPrintifyToken(encrypted, "cd".repeat(32)), /could not be decrypted safely/);
  await assert.rejects(encryptPrintifyToken("token", "not-a-valid-key"), /not configured correctly/);
});

test("rejects oversized Printify uploads immediately and never retries a 413", async () => {
  const { MAX_FILE_BYTES, isPermanentUploadError, oversizedFileMessage } = await import("../app/upload-policy.ts");
  assert.equal(MAX_FILE_BYTES, 100 * 1024 * 1024);
  assert.equal(isPermanentUploadError('Printify returned 413: {"error":"The POST data is too large."}'), true);
  assert.match(oversizedFileMessage("poster.png", 125 * 1024 * 1024), /poster\.png is 125\.0 MB/);
  assert.match(oversizedFileMessage("poster.png", 125 * 1024 * 1024), /without reducing the pixel dimensions needed for 300 DPI/);
});

test("retries a real 8253 draft response and succeeds without an upload lookup", async () => {
  const { createProductWithImageRetries } = await import("../app/api/printify/product-creation.ts");
  const requests = [];
  const retries = [];
  const responses = [
    new Response(JSON.stringify({ status:"error", code:8253, errors:{ reason:"Provided images do not exist" } }), { status:400, headers:{ "content-type":"application/json" } }),
    new Response(JSON.stringify({ id:"draft-created" }), { status:200, headers:{ "content-type":"application/json" } }),
  ];
  let imageId = "first-image";
  const replaced = [];
  const result = await createProductWithImageRetries({ path:"/shops/1/products.json", token:"test-token", body:()=>JSON.stringify({imageId}), fetcher:async (url, init) => { requests.push({ url:String(url), method:init?.method, body:init?.body }); return responses.shift(); }, sleeper:async()=>{}, onRetry:async(attempt,status)=>{ retries.push({attempt,status}); }, onImageNotReady:async(attempt)=>{ replaced.push(attempt); imageId="replacement-image"; } });
  assert.deepEqual(result, { id:"draft-created" });
  assert.equal(requests.length, 2);
  assert.ok(requests.every((request)=>request.url.endsWith("/shops/1/products.json") && request.method === "POST"));
  assert.match(String(requests[0].body), /first-image/);
  assert.match(String(requests[1].body), /replacement-image/);
  assert.deepEqual(retries, [{ attempt:1, status:400 }]);
  assert.deepEqual(replaced, [1]);
});

test("recovers from Printify throttling and network interruption without changing the request", async () => {
  const { createProductWithImageRetries } = await import("../app/api/printify/product-creation.ts");
  const waits = [];
  let calls = 0;
  const result = await createProductWithImageRetries({
    path:"/shops/7/products.json",
    token:"test-token",
    body:JSON.stringify({ title:"same-draft" }),
    fetcher:async (_url, init) => {
      calls += 1;
      assert.equal(init?.body, JSON.stringify({ title:"same-draft" }));
      if (calls === 1) throw new TypeError("network down");
      if (calls === 2) return new Response("limited", { status:429, headers:{ "retry-after":"1" } });
      return new Response(JSON.stringify({ id:"recovered" }), { status:200, headers:{ "content-type":"application/json" } });
    },
    sleeper:async(milliseconds)=>{ waits.push(milliseconds); },
  });
  assert.deepEqual(result, { id:"recovered" });
  assert.equal(calls, 3);
  assert.deepEqual(waits, [3000, 1000]);
});

test("does not retry permanent Printify validation failures", async () => {
  const { createProductWithImageRetries } = await import("../app/api/printify/product-creation.ts");
  let calls = 0;
  await assert.rejects(
    createProductWithImageRetries({
      path:"/shops/7/products.json",
      token:"test-token",
      body:"{}",
      fetcher:async()=>{ calls += 1; return new Response("invalid placement", { status:400 }); },
      sleeper:async()=>{},
    }),
    /Printify returned 400: invalid placement/,
  );
  assert.equal(calls, 1);
});

test("removes every inherited template image ID from the outgoing Printify product", async () => {
  const { printAreasWithOnlyCurrentArtwork } = await import("../app/api/printify/product-payload.ts");
  const template = [{
    variant_ids:[1,2],
    placeholders:[
      { position:"front", images:[{id:"stale-primary",x:0.4,y:0.6,scale:0.8,angle:2},{id:"stale-layer"}] },
      { position:"back", images:[{id:"another-stale",x:0.5,y:0.5,scale:0.4,angle:0}] },
    ],
  }];
  const result = printAreasWithOnlyCurrentArtwork(template, "fresh-upload");
  const ids = result.flatMap((area)=>area.placeholders.flatMap((placeholder)=>placeholder.images.map((image)=>image.id)));
  assert.deepEqual(ids, ["fresh-upload", "fresh-upload"]);
  assert.doesNotMatch(JSON.stringify(result), /stale-primary|stale-layer|another-stale/);
  assert.deepEqual(result[0].placeholders[0].images[0], {id:"fresh-upload",x:0.4,y:0.6,scale:0.8,angle:2});
  const qualityProtected = printAreasWithOnlyCurrentArtwork(template, "fresh-upload", {left:.06,top:0,right:.94,bottom:1}, .8);
  assert.equal(qualityProtected[0].placeholders[0].images[0].scale, .8);
});

test("makes keyword bank saving unmistakable and prevents accidental duplicates", async () => {
  const [page,route,home]=await Promise.all([
    readFile(new URL("../app/keywords/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/keyword-lists/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
  ]);
  assert.doesNotMatch(page,/goldie-wordmark\.webp/);assert.match(page,/ManagementNav active="keywords" listingFactoryHref=\{returnHref\}/);assert.match(page,/save-toast/);assert.doesNotMatch(page,/return-to-work/);
  assert.match(page,/goldie-active-batch/);assert.match(page,/Save changes/);assert.match(page,/Create another bank/);
  assert.match(page,/if\(editingId\)/);assert.match(page,/setName\(""\)/);assert.match(page,/setRaw\(""\)/);
  assert.match(route,/already exists\. Open that bank to update it instead/);
  assert.match(home,/href="\/keywords" target="_blank"/);assert.match(home,/href="\/mockups" target="_blank"/);
});

test("creates unique validated AI titles in bulk with per-listing overrides", async()=>{
  const [page,tools,intelligence]=await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/factory-tools.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/listing-intelligence/route.ts",import.meta.url),"utf8"),
  ]);
  assert.match(page,/Create titles for the whole batch/);assert.match(page,/Auto-create all titles/);assert.match(page,/runBounded\(files,2/);
  assert.match(page,/Goldie selects from my bank/);assert.match(page,/I choose from my bank/);assert.match(page,/Click keywords in the order you want them/);
  assert.match(page,/removeBatchKeyword/);assert.match(page,/clearBatchKeywords/);assert.match(page,/Applied to every listing below/);
  assert.match(page,/Create a different title with AI/);assert.match(page,/Create title for this design/);
  assert.match(page,/autoTitleForDesign/);assert.match(page,/tags:item\.result\.tags/);
  assert.match(page,/separately ranked Etsy tags created/);assert.match(page,/Goldie selects only exact phrases from this bank/);assert.match(page,/Goldie never adds keywords/);
  assert.ok(page.indexOf('className="permanent-description batch-description"')<page.indexOf('className="design-table"'),"The collapsible batch description belongs directly above the individual listings.");
  assert.match(page,/Customize this listing’s description/);assert.match(page,/The complete description is shown below/);
  assert.match(page,/descriptionOverride/);assert.match(page,/scrollIntoView/);
  assert.match(tools,/keywordListsCache/);assert.match(tools,/selectionOnly/);assert.match(tools,/onSelect/);
  assert.match(intelligence,/selected_keywords/);assert.match(intelligence,/allowedByLower/);assert.match(intelligence,/PRODUCT TYPE RULE/);assert.match(intelligence,/if\(!picked\.length\)return NextResponse\.json\(\{error:"This keyword bank is empty/);
  assert.match(intelligence,/tagCandidates=keywords\.filter/);
  assert.match(intelligence,/tag_keywords/);
  assert.match(intelligence,/requiredTagCount=Math\.min\(13,tagCandidates\.length\)/);
  assert.match(intelligence,/return NextResponse\.json\(\{title,keywords:included,tags:pickedTags\.length\?pickedTags:tags,titleWarning,designText\}\)/);
});

test("records permanent sanitized Printify diagnostics without blocking listings", async () => {
  const [page, stage, drafts, diagnostics, admin, adminPage, schema] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/stage/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/drafts/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/diagnostics.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/mastermind-admin/admin-control.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/mastermind-admin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /GLF-/);
  assert.match(page, /supportReference: staged\.reference/);
  assert.match(page, /Support reference:/);
  assert.match(page, /\/api\/printify\/diagnostics/);
  assert.match(stage, /startDiagnostic/);
  assert.match(stage, /recordDiagnostic/);
  assert.match(drafts, /template_lookup/);
  assert.match(drafts, /printify_upload/);
  assert.doesNotMatch(drafts, /diagnosticStage = "image_registration"/);
  assert.match(drafts, /draft_creation/);
  assert.match(diagnostics, /-30 days/);
  assert.match(diagnostics, /Bearer \[redacted\]/);
  assert.match(diagnostics, /Diagnostics must never block listing creation/);
  assert.match(diagnostics, /error_code = COALESCE\(\?, error_code\)/);
  assert.match(schema, /printify_diagnostics/);
  assert.match(schema, /printify_diagnostic_events/);
  assert.match(adminPage, /outcome = 'failed'/);
  assert.match(admin, /Recent failed operations/);
  assert.match(admin, /Search reference, member, design or code/);
  assert.match(admin, /Artwork and tokens are never stored here/);
  assert.match(admin, /Diagnose this member’s Printify account/);
  assert.match(admin, /member-audit\?email=/);
});

test("provides an owner-only member-specific Printify health audit", async () => {
  const audit = await readFile(new URL("../app/api/mastermind/member-diagnostic/route.ts", import.meta.url), "utf8");
  assert.match(audit, /isOwner\(owner\)/);
  assert.match(audit, /mastermind_access/);
  assert.match(audit, /printify_connections/);
  assert.match(audit, /template_product_id/);
  assert.match(audit, /\/uploads\/\$\{encodeURIComponent\(id\)\}\.json/);
  assert.match(audit, /accountDiagnosis/);
  assert.doesNotMatch(audit, /token:\s*token/);
});

test("ships an in-page support assistant with a comprehensive troubleshooting bank", async () => {
  const [page, chat, knowledge, engine, supportCss] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/support-chat.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/support-knowledge.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/support-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/support.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /<SupportChat/);
  assert.match(page, /Get help with this error/);
  assert.match(chat, /we’ll work through it together/);
  assert.match(chat, /goldie-support/);
  assert.match(chat, /sessionStorage\.setItem\("goldie-listing-support-v2"/);
  assert.match(chat, /supportResponse\(clean, messages\)/);
  assert.match(chat, /Contact Support/);
  assert.match(chat, /Screenshot of the error/);
  assert.match(chat, /fetch\("\/api\/support"/);
  assert.doesNotMatch(chat, /web3forms|5b639ca5/);
  assert.doesNotMatch(chat, /ChatGPT chat link|ChatGPT plan/);
  assert.match(supportCss, /width:460px/);
  assert.match(supportCss, /height:680px/);
  assert.match(supportCss, /width:60px;height:60px/);
  assert.match(supportCss, /content:"\?"/);
  assert.match(knowledge, /Provided images do not exist/);
  assert.match(knowledge, /Printify will not connect/);
  assert.match(knowledge, /Template product not found/);
  assert.match(knowledge, /Open all does not open every tab/);
  assert.ok((knowledge.match(/id:/g) ?? []).length >= 20);
  assert.match(engine, /Let’s narrow it down so I can give you the right fix/);
  assert.doesNotMatch(engine, /I’m sorry|frustrating|Thanks for letting me know|I’m happy to help/);
  assert.match(engine, /After you clicked Retry failed designs/);
  assert.match(engine, /You already tried/);
  assert.match(engine, /userContext/);
});

test("keeps support submission authenticated and server-side", async () => {
  const supportRoute = await readFile(new URL("../app/api/support/route.ts", import.meta.url), "utf8");
  assert.match(supportRoute, /getChatGPTUser/);
  assert.match(supportRoute, /customerLaunchBlock/);
  assert.match(supportRoute, /MAX_SCREENSHOT_BYTES/);
  assert.match(supportRoute, /authenticated_member/);
  assert.match(supportRoute, /api\.web3forms\.com/);
});

test("support diagnoses vague reports before prescribing a fix", async () => {
  const engine = await readFile(new URL("../app/support-engine.ts", import.meta.url), "utf8");
  assert.match(engine, /Are you seeing an error message under Connect Printify/);
  assert.match(engine, /That rules out missing token scopes/);
  assert.match(engine, /the token step is already done/);
  assert.match(engine, /does the button change to Connecting/);
  assert.match(engine, /stored only in iCloud, OneDrive or Google Drive/);
  assert.match(engine, /Where do they fail: before the files appear/);
  assert.match(engine, /What exact message appears under one of the failed designs/);
  assert.match(engine, /Does that product open normally/);
  assert.doesNotMatch(engine, /if \(connectionIssue\).*Create a fresh personal access token/);
});

test("ships official brand assets and removes the starter", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(page, /approved-brand/);
  assert.match(page, /approved-wm/);
  assert.match(layout, /Goldie Listing Factory/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await access(new URL("../public/goldie-logo.png", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});

test("keeps the owner test page separate from mastermind access", async () => {
  const [gate, access, page, redeem, admin] = await Promise.all([
    readFile(new URL("../app/customer-launch-gate.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/mastermind/access.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/mastermind/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/mastermind/redeem/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/mastermind/admin/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(gate, /state\.owner/);
  assert.match(gate, /state\.active && state\.redeemed/);
  assert.doesNotMatch(gate, /printify_connections/);
  assert.match(access, /MASTERMIND_ACCESS_CODE/);
  assert.match(access, /crypto\.subtle\.digest/);
  assert.doesNotMatch(access, /GOLDIE-WOLF/);
  assert.match(page, /getChatGPTUser\(\)/);
  assert.match(page, /accountSignInPath\("\/mastermind\?stage=code"\)/);
  assert.match(page, /20 listings and 20 AI lifestyle mockups/);
  assert.match(page, /BetaCountdown/);
  assert.match(page, /params\?\.stage !== "code"/);
  assert.match(page, /<ListingFactory \/>/);
  assert.match(redeem, /INSERT INTO mastermind_access/);
  assert.match(admin, /DELETE FROM printify_connections/);
  assert.match(admin, /SELECT user_id FROM mastermind_access/);
  assert.match(access, /toUpperCase/);
  assert.match(access, /brittanylewismua@gmail\.com/);
  assert.match(access, /shesawolfclothing@gmail\.com/);
});

test("gives the owner testing account room to run real batches", async () => {
  const [limits, usage, drafts, publish] = await Promise.all([
    readFile(new URL("../app/plan-limits.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/usage/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/drafts/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/drafts/publish/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(limits, /OWNER_TEST_PLAN[\s\S]*drafts: 10000/);
  assert.match(limits, /owner \? OWNER_TEST_PLAN/);
  assert.match(usage, /planFor\(planRow\?\.plan_key, isOwner\(user\)\)/);
  assert.match(drafts, /planFor\(planRow\?\.plan_key, isOwner\(user\)\)/);
  assert.match(publish, /planFor\(planRow\?\.plan_key,isOwner\(user\)\)/);
});

test("uses the explicitly selected Google or email account before a stale ChatGPT session", async () => {
  const auth = await readFile(new URL("../app/chatgpt-auth.ts", import.meta.url), "utf8");
  const supabaseLookup = auth.indexOf("createSupabaseServerClient()");
  const platformHeaderLookup = auth.indexOf("requestHeaders.get(USER_ID_HEADER)");
  assert.ok(supabaseLookup >= 0, "Supabase account lookup is present");
  assert.ok(platformHeaderLookup > supabaseLookup, "The newly selected app account takes precedence over platform headers");
  assert.match(auth, /userId: `supabase:\$\{user\.id\}`/);
});

test("never strands a signed-in account on the plan screen", async () => {
  const [signup, route] = await Promise.all([
    readFile(new URL("../app/signup/signup-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/listing-factory/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(signup, /Signed in securely\{signedInEmail/);
  assert.match(signup, /Use a different account/);
  assert.match(signup, /account\/sign-out\?return_to=/);
  assert.match(route, /signedInEmail=\{user\.email\}/);
});

test("revalidates saved Printify tokens instead of showing a false connection", async () => {
  const route = await readFile(new URL("../app/api/printify/route.ts", import.meta.url), "utf8");
  assert.match(route, /await printify<Shop\[\]>\("\/shops\.json", token\)/);
  assert.match(route, /expired or was revoked/);
  assert.match(route, /DELETE FROM printify_connections WHERE user_id = \?/);
});

test("persists mockup sets by signed-in account and protects every image", async () => {
  const [libraryRoute,imageRoute,page,storage] = await Promise.all([
    readFile(new URL("../app/api/mockups/library/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/mockups/library/[id]/image/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/mockups/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/mockups/storage.ts", import.meta.url), "utf8"),
  ]);
  assert.match(libraryRoute,/getChatGPTUser/);
  assert.match(libraryRoute,/env\.ARTWORK\.put/);
  assert.match(imageRoute,/mockupTemplates\.userId/);
  assert.match(storage,/CREATE TABLE IF NOT EXISTS mockup_templates/);
  assert.match(page,/fetch\("\/api\/mockups\/library"\)/);
  assert.doesNotMatch(page,/localStorage|sessionStorage|indexedDB/);
});

test("shows one saved mockup set at a time", async () => {
  const [page,css]=await Promise.all([
    readFile(new URL("../app/mockups/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/mockups/mockups.css", import.meta.url), "utf8"),
  ]);
  assert.match(page,/activeTheme===theme/);
  assert.match(page,/aria-expanded=\{open\}/);
  assert.match(page,/open&&<>/);
  assert.match(page,/useState<Set<string>>\(new Set\(\)\)/);
  assert.match(page,/Add your first mockup set/);
  assert.match(page,/showAddSet&&<div className="addSet"/);
  assert.match(page,/Close mockup set builder/);
  assert.match(page,/className="inlineResults"/);
  assert.doesNotMatch(page,/<section className="mockupResults"/);
  assert.match(page,/type="checkbox"/);
  assert.match(css,/\.collection\.collapsed/);
  assert.match(css,/repeat\(auto-fill,minmax\(190px,1fr\)\)/);
  assert.match(css,/\.collection\.open\{grid-column:1\/-1/);
});

test("caps mockup generation and saved themed sets", async () => {
  const [page,libraryRoute] = await Promise.all([
    readFile(new URL("../app/mockups/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/mockups/library/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page,/MAX_SELECTED_MOCKUPS=10/);
  assert.match(page,/MAX_MOCKUPS_PER_SET=50/);
  assert.match(page,/of 10 selected/);
  assert.match(page,/maximum 50 mockups per set/);
  assert.match(libraryRoute,/MAX_MOCKUPS_PER_SET = 50/);
  assert.match(libraryRoute,/existing\.length>=MAX_MOCKUPS_PER_SET/);
});

test("handles up to eight lifestyle mockups in a reliable queue and shows the recommended photo mix", async () => {
  const [mockups, page] = await Promise.all([
    readFile(new URL("../app/integrated-mockups.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(mockups, /MAX_MOCKUPS_PER_LISTING=8/);
  assert.match(mockups, /next\.size>=MAX_MOCKUPS_PER_LISTING/);
  assert.match(mockups, /runBounded\(jobs,2/);
  assert.match(mockups, /withRecovery/);
  assert.match(page, /Recommended photos for \{templateDetails\?\.blueprintTitle/);
  assert.match(page, /Lifestyle scenes that match this exact garment type/);
  assert.match(page, /Room scenes that show realistic scale/);
  assert.match(page, /An in-use scene that matches this exact drinkware/);
});

test("enforces paid-plan usage on the server and exposes honest usage", async()=>{
  const [plans,drafts,renders,library,usage]=await Promise.all([
    readFile(new URL("../app/plan-limits.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/printify/drafts/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/mockups/render/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/mockups/library/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/usage/route.ts",import.meta.url),"utf8"),
  ]);
  assert.match(plans,/name: "Starter", price: 29, drafts: 100, dailyListings: 40, aiMockups: 50, mockupSets: 10/);
  assert.match(plans,/name: "Pro", price: 59, drafts: 300, dailyListings: 75, aiMockups: 150, mockupSets: 30/);
  assert.match(plans,/name: "Scale", price: 99, drafts: 750, dailyListings: 100, aiMockups: 300, mockupSets: 75/);
  assert.match(drafts,/plan\.drafts/);assert.match(drafts,/status='succeeded'/);
  assert.match(renders,/plan\.aiMockups/);assert.match(renders,/MAX\(0,/);
  assert.match(library,/plan\.mockupSets/);assert.match(library,/COUNT\(DISTINCT theme\)/);
  assert.match(usage,/nextReset/);assert.match(usage,/COALESCE\(SUM\(count\),0\)/);
});

test("saved mockup sets can be renamed and deleted with confirmation", async () => {
  const [page,libraryRoute] = await Promise.all([
    readFile(new URL("../app/mockups/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/mockups/library/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page,/aria-label={`Rename \${theme}`}/);
  assert.match(page,/Yes, delete set/);
  assert.match(page,/permanently removes the set and every saved mockup inside it/);
  assert.match(libraryRoute,/export async function PATCH/);
  assert.match(libraryRoute,/export async function DELETE/);
  assert.match(libraryRoute,/ARTWORK\.delete\(row\.objectKey\)/);
  assert.match(page,/sourceTheme/);
  assert.match(libraryRoute,/mockup_set_preferences/);
  assert.doesNotMatch(page,/items\.some\(item=>item\.custom\).*Rename/);
  assert.match(page,/setTitleRow.*open&&<button[^>]+className="renameSet"/);
  assert.doesNotMatch(page,/collectionActions"><button[^>]+className="renameSet"/);
});

test("routes each product surface deliberately and never releases a partial batch", async () => {
  const [page,integrated,renderers,route]=await Promise.all([
    readFile(new URL("../app/mockups/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/integrated-mockups.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/mockups/product-renderers.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/mockups/render/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page,/"rigid-flat" \| "t-shirt" \| "sweatshirt" \| "hoodie" \| "other-apparel" \| "apparel" \| "soft-goods" \| "curved" \| "irregular"/);
  assert.match(page,/made\.forEach\(item=>URL\.revokeObjectURL/);
  assert.match(page,/setResults\(\[\]\);setGenerationError/);
  assert.match(page,/isCalibratedSurface\(kind\)\?await makeMockup/);
  /* D456 · The Mockup Library composites every surface too. Removing the
     generative renderer from the Listing Factory and not from here left the same
     fault reachable from a different screen. */
  assert.match(page,/return makeMockup\(file,template\);/);
  assert.doesNotMatch(page,/api\/mockups\/render/,
    "the Mockup Library must not send a design to an image model either");
  // The calibrated branch now lives in generate(), because the padded design and
  // the trimmed design must not be able to reach the wrong renderer.
  /* D433 · The calibrated path now derives its placement from the Printify
     preview and the segmented product box, and only falls back to the old
     constants when either measurement is unavailable. */
  /* D447 · Every scene now ends in the canvas renderer, which needs no network
     and cannot refuse a quad. The AI renderer is tried first only where it is the
     better result, and falls back rather than losing the scene. */
  /* D448 · Every surface composites now — nothing that redraws her photograph can
     be used to place a design on it. */
  assert.match(integrated,/return drawLocally\(\);/);
  assert.doesNotMatch(integrated,/await product\(design,template,reference\)/,
    "the generative renderer no longer places designs");
  assert.match(integrated,/return derived\?rigid\(design,template,derived\.adjustment,derived\.quad\)/);
  assert.match(integrated,/:rigid\(design,template,placementAdjustment\(placement,template\.surfaceKind\|\|"rigid-flat"\)\)/,
    "the constants remain the fallback, never the first answer");
  // The old constants may survive only as the pre-mirroring fallback for drafts
  // that predate placement being recorded - never as a live placement decision.
  assert.doesNotMatch(integrated,/PLACEMENT_BEFORE_MIRRORING/);
  assert.match(integrated,/needsReference=chosen\.some\(t=>!isCalibratedSurface/);
  assert.doesNotMatch(page,/cleanArtworkBackground/);
  assert.doesNotMatch(integrated,/cleanArtworkBackground/);
  assert.match(route,/if\(!body\.reference\)/);
  assert.match(route,/plan\.aiMockups/);
  assert.match(route,/monthKey/);
  assert.match(route,/queue\.fal\.run/);
  assert.match(route,/mockup_render_jobs/);
  assert.match(route,/statusPayload\.status!=="COMPLETED"/);
  assert.doesNotMatch(renderers,/fashn\/tryon/);
  assert.match(renderers,/Do not create, replace, redraw, layer, or paste in a new shirt or garment/);
  assert.match(renderers,/only visible change.*design printed on the original garment/);
  assert.doesNotMatch(renderers,/shirt-design/);
  assert.match(renderers,/flux-2-flex\/edit/);
  assert.match(renderers,/guidance_scale:2\.5/);
});

test("restores batch colors and blocks publishing until every selected listing has a photo", async () => {
  const [page,review]=await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/final-listing-review.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page,/selectedColorIds\?:number\[\]/);
  assert.match(page,/function batchStateSnapshot\(\).*selectedColorIds,/s);
  assert.match(page,/setSelectedColorIds\(state\.selectedColorIds\?\.length/);
  assert.match(page,/selectedPublishDrafts\(\)/);
  assert.match(page,/Add a photo to every selected listing before publishing/);
  assert.match(review,/Choose exactly which listings to publish/);
  assert.match(review,/Add at least one listing photo/);
});

test("draft progress cannot exceed the selected batch", async () => {
  const page = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  assert.match(page,/draftRunActive\.current/);
  assert.match(page,/completedDesignIds\.has\(result\.clientId\)/);
  assert.match(page,/Math\.min\(completedDesignIds\.size,targetFiles\.length\)/);
});

test("keeps pricing simple while using a real Etsy shipping profile and exact template prices", async () => {
  const [page,drafts,profiles,publish] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/drafts/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/etsy/shipping-profiles/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/drafts/publish/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page,/Shipping profile/);
  assert.match(page,/Currently attached to this product/);
  /* D319 · The match count used to be the ONLY feedback that search worked,
     because the filtered list was hidden inside a closed <select>. It is now a
     quiet footnote under a list you can actually see. */
  assert.match(page,/\{searchedProfiles\.length\} of \{profiles\.length\} profiles/);
  assert.match(page,/templateProfileId=Number\(templateDetails\?\.shippingTemplateId\)/);
  assert.match(page,/setEtsyShippingProfileId\(current=>current\|\|templateProfileId\)/);
  assert.match(page,/buyer pays/);
  assert.match(page,/international rates/i);
  assert.match(page,/international-shipping-editor/);
  /* D232 · The "Etsy buyer charge / Printify shipping cost / International buyer
     charges" chips restated numbers the dropdown option already shows. The one
     figure not visible elsewhere is the shortfall against Printify's cost, which
     keeps its own warning. */
  assert.doesNotMatch(page,/className="shipping-quick-summary"/);
  assert.match(page,/is \$\{shippingShortfall\.toFixed\(2\)\} below Printify/);
  assert.match(page,/Save new shipping profile/);
  assert.match(page,/\{section==="all"\?"1\. ":""\}Item prices/);
  assert.match(page,/Printify product cost/);
  assert.match(page,/price-group-list/);
  assert.match(page,/Printify cost/);
  /* D232 · "— what buyers pay" stated the obvious; buyers always pay shipping. */
  assert.match(page,/\{section==="all"\?"2\. ":""\}Etsy shipping profile/);
  assert.doesNotMatch(page,/Update prices/);
  assert.match(page,/Prices update automatically/);
  assert.match(page,/changeProfit\(value:number\)[\s\S]*recalculate\(nextPricing\)/);
  assert.match(page,/Create a custom shipping profile \(optional\)/);
  assert.match(page,/Your current prices already meet this profit goal/);
  assert.match(page,/recommendation-result/);
  assert.match(page,/Discard changes/);
  assert.match(page,/save or discard any custom shipping profile changes/i);
  assert.doesNotMatch(page,/Approve pricing \+ shipping/);
  /* D232 · That chip restated what the dropdown option already shows. The figure
     that is NOT visible elsewhere — the shortfall against Printify's cost — keeps
     its own warning, which is what actually protects the seller. */
  assert.match(page,/is \$\{shippingShortfall\.toFixed\(2\)\} below Printify/);
  /* D217: pricing moved onto the Product page, so this step is draft creation
     and is described as that. The pricing UI itself is asserted intact by
     tests/feature-inventory.test.mjs. */
  assert.match(page, /Goldie creates an unpublished draft in Printify for every design in this batch/);
  assert.doesNotMatch(page,/pricing target, keyword bank, and mockup defaults/);
  assert.match(page,/variant\.templatePrice/);
  /* D303 · Replaced by the ✓ line above it; the fee controls remain. */
  assert.match(page,/fee-profile-summary/);
  assert.match(page,/Change fee settings/);
  assert.doesNotMatch(page,/Split it 50\/50|Custom buyer shipping price|shippingPercent/);
  assert.match(profiles,/shipping-profiles/);
  assert.match(profiles,/domesticPrimary/);
  assert.match(publish,/etsyShippingProfileId/);
  assert.match(drafts,/shipping_template_id:selectedShippingTemplateId/);
  assert.match(drafts,/etsyBuyerShipping/);
  assert.match(page,/loadTemplateUrl\(recipe\.templateUrl,nextPricing,Number\(recipe\.etsyShippingProfileId\)\|\|0,recipe\.defaultColorIds\|\|\[\],recipe\.defaultSizeIds\|\|\[\]\)/ /* D164 added the size argument */);
  assert.match(page,/PriceField value=\{itemCents\} minimum=\{variant\.cost\/100\}/);
  assert.match(page,/Create a custom shipping profile \(optional\)/);
  assert.match(page,/Name your new shipping profile/);
  assert.match(page,/your original profile will not change/i);
  assert.match(page,/international rates/i);
  assert.match(page,/Additional/);
  assert.match(page,/international:InternationalShippingRate\[\]/);
  assert.match(page,/First item/);
  assert.match(page,/Additional/);
  assert.match(page,/Save new shipping profile/);
  assert.match(page,/setDraft\(event\.target\.value\)/);
  assert.match(page,/onBlur=\{commit\}/);
  assert.match(profiles,/export async function POST/);
  assert.match(profiles,/destinations\.filter\(item=>item!==domestic\)/);
  assert.match(profiles,/setTimeout\(resolve,250\)/);
  const etsyClient=await readFile(new URL("../app/api/etsy/client.ts",import.meta.url),"utf8");
  assert.match(etsyClient,/response\.status===429/);assert.match(etsyClient,/retry-after/);assert.match(etsyClient,/attempt<5/);
  assert.match(page,/changeCostGroupPrice/);assert.match(page,/with a \$\$\{\(cost\/100\)\.toFixed\(2\)\} Printify cost/);assert.match(page,/changeIndividualPrice/);
  const recipes=await readFile(new URL("../app/api/product-recipes/route.ts",import.meta.url),"utf8");
  assert.match(recipes,/etsyShippingProfileId/);
});

test("keeps management headings readable and shows the complete workflow map on phones", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css,/management-page>header h1,.usage-page>header h1\{color:#f7f0e4\}/);
  assert.match(css,/management-page \.management-nav a\.active,.usage-page \.management-nav a\.active\{color:#fff\}/);
  assert.match(css,/@media\(max-width:600px\)\{\.workflow-progress\{display:grid;grid-template-columns:repeat\(2/);
});

test("keeps the custom shipping profile name beside its field", async()=>{
  const css=await readFile(new URL("../app/globals.css",import.meta.url),"utf8");
  assert.match(css,/\.custom-shipping-body>label\{display:grid/);
  assert.match(css,/\.custom-shipping-body>label>input\{width:100%;min-width:0\}/);
});

test("uses the premium lilac command-center design system across Goldie",async()=>{
  const [layout,theme]=await Promise.all([
    readFile(new URL("../app/layout.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/lilac-theme.css",import.meta.url),"utf8"),
  ]);
  assert.match(layout,/lilac-theme\.css/);
  assert.match(theme,/--violet:#7052ca/);
  assert.match(theme,/\.workflow-progress button\.active/);
  assert.match(theme,/\.workflow-next/);
  assert.match(theme,/\.mockupFactory\{/);
  assert.match(theme,/@media\(max-width:700px\)/);
  assert.match(theme,/@media\(prefers-reduced-motion:reduce\)/);
});

test("keeps batch history useful instead of accumulating unmanageable empty sessions", async () => {
  const [page,batches] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/batches/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page,/\(!files\.length&&!drafts\.length\)\)return/);
  assert.match(batches,/Permanently remove from history/);
  assert.match(batches,/Products already created in Printify and listings already on Etsy are not deleted/);
  assert.match(batches,/method:"DELETE"/);
});

test("connects Etsy with PKCE and finishes only the exact Printify-linked Etsy listing", async()=>{
  const [page,oauth,callback,client,publish,queue,finish,migration]=await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/etsy/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/etsy/callback/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/etsy/client.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/printify/drafts/publish/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/printify/drafts/publish/queue.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/etsy/finish.ts",import.meta.url),"utf8"),
    readFile(new URL("../drizzle/0009_etsy_connection.sql",import.meta.url),"utf8"),
  ]);
  assert.match(page,/Connect Etsy before publishing/);
  assert.match(oauth,/code_challenge_method:"S256"/);
  assert.match(oauth,/listings_r listings_w shops_r shops_w/);
  assert.match(oauth,/etsyRedirectUri/);
  assert.match(callback,/grant_type:"authorization_code"/);
  assert.match(callback,/goldieSiteUrl/);
  assert.match(client,/grant_type:"refresh_token"/);
  assert.match(client,/ETSY_REDIRECT_URI/);
  assert.match(client,/goldie-listing-factory-next\.brittanylewismua\.chatgpt\.site\/api\/etsy\/callback/);
  assert.match(client,/ETSY_API_SECRET/);
  assert.match(queue,/waitForEtsyListing/);
  assert.match(queue,/product\.external\?\.id/);
  assert.doesNotMatch(`${publish}\n${queue}`,/sort_on|newest|title.*match/i);
  assert.match(finish,/listing\.shop_id/);
  assert.match(finish,/Goldie stopped without editing it/);
  assert.match(finish,/applyEtsyDetails/);
  assert.match(finish,/applyListingImages/);
  assert.doesNotMatch(finish,/body\.set\("title"/);
  assert.match(migration,/etsy_connections/);
  assert.match(migration,/etsy_listing_links/);
});

test("preserves the final plain-text description and applies it directly to Etsy", async()=>{
  const [page,finish]=await Promise.all([readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),readFile(new URL("../app/api/etsy/finish.ts",import.meta.url),"utf8")]);
  assert.match(page,/\.join\("\\n\\n"\)/);
  assert.match(finish,/shipping_profile_id:String\(shippingProfileId\),description/);
  assert.match(finish,/String\(draft\.description\|\|""\)/);
});

test("makes progress satisfying and returns a precise outcome receipt", async()=>{
  const [page,ui,theme]=await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/goldie-ui.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/lilac-theme.css",import.meta.url),"utf8"),
  ]);
  assert.match(page,/WorkflowMomentum/);assert.match(page,/OutcomeReceipt/);assert.match(page,/setBatchReceipt/);
  assert.match(ui,/Autosave on/);assert.match(ui,/steps complete/);assert.match(ui,/quick summary of what Goldie completed/);
  assert.match(ui,/Open Etsy listing/);assert.match(ui,/Duplicate this workflow/);assert.match(ui,/Choose another product/);assert.match(ui,/View batch history/);
  assert.match(theme,/workflow-momentum/);assert.match(theme,/outcome-receipt/);assert.match(theme,/prefers-reduced-motion/);
});

test("turns Goldie into a returning-user command center with contextual intelligence",async()=>{
  const [page,dashboard,theme,system]=await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/returning-command-center.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/lilac-theme.css",import.meta.url),"utf8"),
    readFile(new URL("../DESIGN_SYSTEM.md",import.meta.url),"utf8"),
  ]);
  assert.match(dashboard,/Resume your last batch/);assert.match(dashboard,/Start another batch/);assert.match(dashboard,/Recent products/);
  assert.match(dashboard,/Keyword banks/);assert.match(dashboard,/Mockup sets/);assert.match(dashboard,/listings created this month/);
  assert.match(dashboard,/GoldieCommandBar/);assert.match(dashboard,/metaKey/);assert.match(page,/GoldieInsight/);assert.match(page,/currentInsight/);
  assert.match(page,/progressIndex>0&&<WorkflowMomentum/);assert.match(page,/lowDpiCount/);assert.match(page,/variants approved/);
  assert.match(theme,/--g-plum-700/);assert.match(theme,/step-resolve/);assert.match(theme,/item-arrive/);
  assert.match(system,/Fixed palette/);assert.match(system,/Canonical components/);assert.match(system,/Visual-change protocol/);
});

test("recovers published-template shipping and constrains Etsy categories by product type",async()=>{
  const [printify,taxonomy,page]=await Promise.all([
    readFile(new URL("../app/api/printify/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/etsy/taxonomy/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
  ]);
  assert.match(printify,/externalListingId/);
  assert.match(printify,/shipping_profile_id/);
  assert.match(printify,/if\(externalListingId>0\)/);
  assert.doesNotMatch(printify,/if\(!shippingTemplateId&&externalListingId>0\)/);
  assert.match(taxonomy,/productCategoryScore/);
  assert.match(taxonomy,/art & collectibles › prints ›/);
  assert.match(taxonomy,/exactLeaf/);
  assert.match(taxonomy,/dress shirts\?\|button\[- \]downs\?/);
  assert.match(taxonomy,/childCategory/);
  assert.match(taxonomy,/childProduct/);
  assert.match(taxonomy,/notebook\|journal/);
  assert.match(taxonomy,/phone case/);
  assert.match(taxonomy,/gender\[- \]neutral adult/);
  assert.match(page,/product:\{blueprintTitle:templateDetails/);
});

/* D416 · Connect is a one-time gate before the four steps, not the first of
   them - it used to read "Step 1 of 4 · Product" under "Connect your accounts". */
test("places each step count directly below its page title", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/approved-functional.css", import.meta.url), "utf8"),
  ]);
  /* D220: four stages, so the counter is "Step 2 of 4 · Images" rather than a
     top-level count with a nested "Finish · phase (n of 4)" variant. */
  assert.match(page, /<p className="hero-step-count">\{workflowStep==="connect"\?"Account setup · before you start":`Step \$\{railTopNumber\} of \$\{RAIL_STAGES\.length\} · \$\{currentStage\.label\}`\}<\/p>/);
  assert.doesNotMatch(page, /className="approved-step-count"/);
  assert.match(styles, /\.app-shell \.hero-step-count/);
  assert.match(styles, /\.app-shell \.hero\{padding-bottom:30px!important\}/);
});

test("labels every progress bubble with a short workflow name", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/approved-functional.css", import.meta.url), "utf8"),
  ]);
  /* D222 · RAIL_STAGES carries the labels now, one per page, so the parallel
     nine-entry short-label array is gone. */
  assert.match(page, /\{label:"Product",index:1,title:"Choose product"/);
  assert.match(page, /\{label:"Images",index:2,title:"Designs \+ images"/);
  assert.match(page, /\{label:"Listing",index:5,title:"Titles \+ Etsy details"/);
  assert.match(page, /\{label:"Publish",index:8,title:"Review \+ publish"/);
  assert.match(page, /<em className="progress-bubble-label">\{stage\.label\}<\/em>/);
  assert.match(page, /className="progress-bubble-label"/);
  assert.match(styles, /\.app-shell \.progress-bubble-label\{/);
});

test("keeps product context only on product-specific steps and progress controls circular", async () => {
  const [globalStyles, approvedStyles] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/approved-functional.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(globalStyles, /\.designs-step\.active-panel \.step-content:before/);
  assert.match(globalStyles, /margin:0 auto 18px/);
  assert.match(approvedStyles, /\.workflow-progress button:hover:not\(:disabled\)/);
  assert.match(approvedStyles, /border-radius:50%!important/);
});

test("shows accurate completion feedback above each next step card", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/approved-functional.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /fileNotice&&\(workflowStep==="setup"\|\|workflowStep==="designs"\)&&<p className="file-add-notice"/);
  assert.match(page, /Titles, tags, and descriptions complete/);
  assert.match(page, /Etsy details complete/);
  assert.match(page, /Listing photos complete/);
  assert.doesNotMatch(page, /fileNotice&&workflowStep!=="designs"/);
  assert.match(styles, /\.app-shell \.step-success-banner\{/);
  /* D156 recoloured this from green to the app palette; the point of this test is
   * that the banner exists and is styled, not that it is green. */
  assert.match(styles, /border:1px solid rgba\(139,89,137,\.28\)/);
});

/* D413 · Capitalization moved into the Title format group beside the comma
   choice - it is the same decision, how the title is formatted. */
test("supports whole-number pricing, unclipped profit columns, and optional title caps", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Create whole-number pricing/);
  assert.match(page, /Math\.ceil\(current\/100\)\*100/);
  assert.match(page, /\{titleCaps\?"Capitalized":"Not capitalized"\}/);
  assert.match(page, /Titles, tags, and descriptions complete/);
  assert.match(styles, /\.price-group-row,.price-group-row>div\{min-width:0\}/);
  assert.match(styles, /\.workflow-panel\.active-panel/);
});

test("keeps the Step 6 listing count on one line", async () => {
  const styles = await readFile(new URL("../app/approved-functional.css", import.meta.url), "utf8");
  assert.match(styles, /\.app-shell \.finish-mode \.editor-heading>span\{/);
  assert.match(styles, /white-space:nowrap!important/);
  assert.match(styles, /min-width:max-content!important/);
});

test("renders personalization as an On-left Off-right toggle", async () => {
  const [page,styles] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/approved-functional.css", import.meta.url), "utf8"),
  ]);
  assert.match(styles, /\.app-shell \.personalization-switch\{/);
  assert.match(styles, /\.personalization-switch:before\{content:"On"\}/);
  assert.match(styles, /\.personalization-switch:after\{content:"Off"\}/);
  assert.match(styles, /\.personalization-switch:has\(input:checked\)>span\{transform:translateX\(-58px\)\}/);
  assert.match(page, /role="switch" aria-label="Personalization" aria-checked=\{enabled\}/);
});

test("shows every public plan on Usage and Billing with direct plan controls", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/usage/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/management-aesthetic.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Free Trial/);
  assert.match(page, />Starter</);
  assert.match(page, />Pro</);
  assert.match(page, />Scale</);
  assert.match(page, /Manage current plan/);
  assert.match(page, /choosePlan\("scale"\)/);
  assert.match(styles, /\.usage-plan-grid/);
  assert.match(styles, /article\.current/);
});

test("supports Etsy's current multi-question personalization workflow", async () => {
  const [page, finish] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/etsy/finish.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /PersonalizationEditor/);
  assert.match(page, /Text answer/);
  assert.match(page, /Dropdown choices/);
  assert.match(page, /Etsy allows up to 30 choices, with 20 characters per choice/);
  assert.match(page, /slice\(0,30\)/);
  assert.match(page, /File upload/);
  assert.match(page, /questions\.length<5/);
  assert.match(page, /personalizationProblem/);
  assert.match(finish, /supports_multiple_personalization_questions=true/);
  assert.match(finish, /max_allowed_characters/);
  assert.match(finish, /max_allowed_files/);
  assert.match(finish, /slice\(0,30\)/);
  assert.match(finish, /label\.trim\(\)\.slice\(0,20\)/);
  assert.match(finish, /method:"DELETE"/);
});

test("appends later design selections and skips only exact file duplicates", async () => {
  const page = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  assert.match(page, /crypto\.subtle\.digest\("SHA-256",bytes\)/);
  assert.match(page, /const combined=\[\.\.\.files,\.\.\.images\]/);
  assert.match(page, /setFiles\(combined\)/);
  assert.match(page, /exact \$\{duplicateCount===1\?"duplicate was":"duplicates were"\} skipped/);
  assert.match(page, /saveBatchFiles\(durableBatchId,combined\.map/);
  assert.match(page, /Choose again to add more/);
  assert.match(page, /className="file-add-notice"/);
});

test("keeps a verified Printify template usable when its Etsy listing is inactive", async () => {
  const [page, workflow, printify, drafts] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/factory-tools.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/drafts/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(workflow, /verifiedShippingProfileId/);
  assert.match(workflow, /etsyShippingProfileId:shippingProfileId/);
  assert.match(page, /savedShippingProfileId/);
  assert.match(page, /Number\(recipe\.etsyShippingProfileId\)\|\|0/);
  assert.match(printify, /shipping-profiles\/\$\{rememberedProfileId\}/);
  assert.match(printify, /!profile\.is_deleted/);
  assert.match(printify, /let shippingTemplateId="";/);
  assert.doesNotMatch(printify, /shippingTemplateId=String\(found\.product\.external\?\.shipping_template_id/);
  assert.match(printify, /shippingProfileNeedsSelection=!shippingTemplateId&&externalListingId>0/);
  assert.match(page, /!templateDetails\?\.shippingTemplateId&&!templateDetails\?\.shippingProfileNeedsSelection/);
  assert.match(page, /shippingTemplateId:etsyShippingProfileId/);
  assert.match(drafts, /selectedShippingTemplateId/);
  assert.match(drafts, /external:\{shipping_template_id:selectedShippingTemplateId\}/);
  assert.match(printify, /UPDATE product_recipes SET pricing_json/);
});

test("does not invent high-risk Etsy context fields", async () => {
  const intelligence = await readFile(new URL("../app/api/listing-intelligence/route.ts", import.meta.url), "utf8");
  assert.match(intelligence, /TEXT_SUPPORTED_OPTIONAL=\/\^\(room\|holiday\|occasion\|recipient\)\$\/i/);
  assert.match(intelligence, /normalizedContext\.includes/);
  assert.match(intelligence, /supportedOptional\(raw\.attributes,contextualText\)/);
  assert.match(intelligence, /supportedOptional\(raw\.optional,contextualText\)/);
});

test("keeps mastermind enrollment owner-controlled while enforcing each 48-hour beta", async () => {
  const [access, countdown, redeem, plans] = await Promise.all([
    readFile(new URL("../app/mastermind/access.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/mastermind/beta-countdown.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/mastermind/redeem/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/plan-limits.ts", import.meta.url), "utf8"),
  ]);
  assert.match(access, /datetime\(redeemed_at, '\+48 hours'\)/);
  assert.match(access, /accessEnabled=setting\?\.active===1/);
  assert.doesNotMatch(access, /MASTERMIND_BETA_REDEEM_UNTIL/);
  assert.match(access, /redeemed&&!notExpired/);
  assert.match(countdown, /window\.setInterval\(update,1000\)/);
  assert.match(redeem, /plan_key='mastermind_beta'/);
  assert.match(plans, /drafts: 20, dailyListings: 20, aiMockups: 20/);
});

test("blocks the factory workflow on mobile while preserving saved work", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/approved-functional.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /className="mobile-gate"/);
  assert.match(page, /built for desktop/);
  assert.match(page, /Your saved work will be waiting for you/);
  assert.match(styles, /@media\(max-width:820px\)/);
  assert.match(styles, /\.app-shell>:not\(\.mobile-gate\)\{display:none!important\}/);
});

test("supports simple saved product bundles without complicating the single-product workflow", async () => {
  const [page, workflow, api, schema, ui, styles, approvedStyles] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/factory-tools.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/product-bundles/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/goldie-ui.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/approved-functional.css", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /productBundles = sqliteTable\("product_bundles"/);
  assert.match(api, /Choose at least two saved products/);
  assert.match(api, /up to four products/);
  assert.match(api, /eq\(productRecipes\.userId,user\.userId\)/);
  assert.match(workflow, /Product bundles/);
  assert.match(workflow, /Upload each design once, then Goldie carries it through every product/);
  /* Was "Using this design on multiple products?" — shown on the product step,
   * before any design has been uploaded, so it asked about something that did
   * not exist yet. See D118. */
  assert.match(workflow, /Want one batch to cover several products\?/);
  assert.match(workflow, /"✓ Ready"/); /* D175: shortened so it fits a compact tile */
  assert.match(workflow, /Choose the products in the order you want to complete them/);
  assert.match(workflow, /bundleSaveLock\.current/);
  assert.match(workflow, /Saving bundle…/);
  assert.match(workflow, /aria-busy=\{bundleSaving\}/);
  /* D135: selection resolves the bundle's persisted ids against current server
   * data instead of trusting a transient array assembled by the tile. */
  assert.match(workflow, /props\.onUseBundle\(bundle,bundle\.recipeIds\)/);
  assert.match(page, /fetch\("\/api\/product-recipes"\)/);
  assert.match(page, /recipes\.length!==requestedIds\.length/);
  assert.match(workflow, /Goldie could not load every saved product in this bundle/);
  /* D136: a bundle has one tile and therefore one selected state. */
  assert.equal((workflow.match(/bundles\.map\(/g)||[]).length,1);
  /* D175: the bundle tile label was "N products · Choose this bundle →", which
   * overflowed a 207px tile on both sides. Shortened to match the product tiles. */
  assert.match(workflow, /selected\?"✓ Ready":"Choose →"/);
  assert.match(api, /deduplicated:true/);
  assert.match(page, /function useBundle/);
  /* D174: the banner names the current product; "You are working on" repeated
   * the eyebrow above it and was set in the wrong face. */
/* D336 · The header used to lead with the FIRST PRODUCT's name and put the
     bundle name underneath, so choosing a bundle looked like choosing a hoodie.
     It names the bundle now; the stepper says which product you are on. */
/* D355 · The whole bundle banner is gone. It announced what had just been
     selected, above a page you reached BY selecting it, and each product card
     below already carries its own name. */
  assert.doesNotMatch(page, /className="bundle-progress"/,
    "no banner restating the selection that brought you here");
  assert.doesNotMatch(page, /index===bundleIndex\?"You are here"/,
    "no stepper, so no you-are-here");
  assert.doesNotMatch(page, /bundle-progress"[^>]*>[\s\S]{0,400}<ol>/,
    "and no ordered list of products beside the line that already lists them");
  assert.match(page, /\{section==="all"\?"1\. ":""\}Item prices\{section==="all"&&<span> · \{productName\}<\/span>\}/);
  assert.match(page, /\{section==="all"\?"2\. ":""\}Etsy shipping profile\{section==="all"&&<span> · \{productName\}<\/span>\}/);
  assert.match(page, /data-product-selected=\{templateDetails\?"true":"false"\}/);
  /* D378 · The --active-product custom property fed a "CURRENT PRODUCT ·" chip
     that existed only because Images, Listing and Publish showed one product at
     a time. Those steps carry the same product cards as step 1 now, and each
     card header names its own product, so the chip and the variable are gone. */
  assert.doesNotMatch(page, /--active-product/,
    "the card header names the product; a chip above it said the same thing twice");
  assert.match(page, /stepProductCards\(bundleCardStatus\("images"\)/);
  assert.match(page, /stepProductCards\(bundleCardStatus\("listing"\)/);
  assert.match(page, /stepProductCards\(bundleCardStatus\("publish"\)/);
  assert.match(page, /function continueBundle/);
  assert.match(page, /activeBundle,bundleRecipes,bundleIndex/);
  assert.match(page, /previewUrl:URL\.createObjectURL\(file\.file\)/);
  assert.match(page, /descriptionOverride:undefined/);
  assert.match(page, /setWorkflowStep\("designs"\)/);
  assert.match(ui, /Continue bundle with/);
  assert.match(ui, /pricing, shipping, description, Etsy details, and images separately/);
  assert.match(styles, /\.bundle-progress/);
  assert.match(styles, /CURRENT PRODUCT ·/);
  assert.doesNotMatch(styles, /\.designs-step\.active-panel \.step-content:before/);
  /* D378 · Same removal as above, from the stylesheet side. */
  assert.doesNotMatch(styles, /content:"CURRENT PRODUCT/,
    "the product cards on steps 2-4 carry this now");
  assert.match(approvedStyles, /\.app-shell \.recipe-card \.edit-recipe\{position:static!important/);
  assert.match(approvedStyles, /\.app-shell \.recipe-card \.delete-recipe\{position:static!important/);
  assert.match(approvedStyles, /\.app-shell \.recipe-card \.recipe-use,[\s\S]*?grid-column:1\/-1!important/);
  assert.match(approvedStyles, /Collision safeguards shared by every workflow step/);
});

test("downloads each listing's selected Printify photos and created mockups as one local ZIP",async()=>{
  const [page,route,styles]=await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/listing-photos/download/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8"),
  ]);
  assert.match(page,/Download this listing’s photos/);
  assert.match(page,/Preparing photos…/);
  assert.match(page,/printifyImageIndices:indices/);
  assert.match(route,/SELECT response_json FROM printify_draft_results/);
  assert.match(route,/01-printify/);
  assert.match(route,/02-lifestyle-mockups/);
  assert.match(route,/zipSync/);
  assert.match(styles,/\.listing-photo-download/);
});

test("explains every Printify template requirement and the exact link to paste",async()=>{
  const source=await readFile(new URL("../app/factory-tools.tsx",import.meta.url),"utf8");
  assert.match(source,/Publish the product to Etsy first/);
  assert.match(source,/Add temporary artwork and set its placement/);
  assert.match(source,/Publish the product from Printify to Etsy/);
  assert.match(source,/Copy the URL only from the Printify design editor/);
  assert.match(source,/Do not use: an Etsy URL, public product URL, Printify product-list URL, or product ID alone/);
});

test("queues Etsy publishing durably and protects shared API capacity",async()=>{
  const [route,queue,client,finish,schema,migration,plans,page,usage]=await Promise.all([
    readFile(new URL("../app/api/printify/drafts/publish/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/printify/drafts/publish/queue.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/etsy/client.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/etsy/finish.ts",import.meta.url),"utf8"),
    readFile(new URL("../db/schema.ts",import.meta.url),"utf8"),
    readFile(new URL("../drizzle/0011_etsy_publish_queue.sql",import.meta.url),"utf8"),
    readFile(new URL("../app/plan-limits.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/usage/route.ts",import.meta.url),"utf8"),
  ]);
  assert.match(plans,/drafts: 100, dailyListings: 40/);
  assert.match(plans,/drafts: 300, dailyListings: 75/);
  assert.match(route,/published_at>=datetime\('now','-24 hours'\)/);
  assert.match(route,/status IN \('queued','running'\)/);
  assert.match(route,/ON CONFLICT\(user_id,product_id\)/);
  assert.match(route,/ON CONFLICT\(user_id,batch_id\)/);
  assert.match(queue,/status='running'.*status='queued'/s);
  assert.match(queue,/locked_at<\?/);
  assert.match(queue,/attempt<5/);
  assert.match(queue,/processNextGlobalPublishItem/);
  assert.match(queue,/etsy_listing_usage/);
  assert.match(client,/Math\.floor\(limit\*\.8\)/);
  assert.match(client,/etsy_api_usage_buckets/);
  assert.match(client,/x-limit-per-day/);
  assert.match(client,/recordEtsyCall\(response\)/);
  assert.match(finish,/recordEtsyCall\(response\)/);
  assert.match(schema,/etsyPublishJobs/);
  assert.match(schema,/etsyApiUsageBuckets/);
  assert.match(migration,/CREATE UNIQUE INDEX `idx_etsy_publish_items_user_product`/);
  assert.match(migration,/CREATE UNIQUE INDEX `idx_etsy_publish_jobs_user_batch`/);
  assert.match(page,/goldie-active-publish-job/);
  assert.match(page,/safely resuming your queued batch/);
  assert.match(usage,/AVG\(api_calls\)/);
});

test("runs the Etsy queue every minute and gives the owner operational controls",async()=>{
  const [worker,vite,queue,client,finish,operations,api,schema,migration]=await Promise.all([
    readFile(new URL("../worker/index.ts",import.meta.url),"utf8"),readFile(new URL("../vite.config.ts",import.meta.url),"utf8"),readFile(new URL("../app/api/printify/drafts/publish/queue.ts",import.meta.url),"utf8"),readFile(new URL("../app/api/etsy/client.ts",import.meta.url),"utf8"),readFile(new URL("../app/api/etsy/finish.ts",import.meta.url),"utf8"),readFile(new URL("../app/operations/page.tsx",import.meta.url),"utf8"),readFile(new URL("../app/api/operations/route.ts",import.meta.url),"utf8"),readFile(new URL("../db/schema.ts",import.meta.url),"utf8"),readFile(new URL("../drizzle/0012_etsy_queue_operations.sql",import.meta.url),"utf8"),
  ]);
  assert.match(worker,/async scheduled/);assert.match(worker,/drainGlobalPublishQueue/);assert.match(worker,/kickGlobalPublishQueueIfDue/);assert.match(vite,/crons: \["\* \* \* \* \*"\]/);
  assert.match(queue,/MAX_CONCURRENT_LISTINGS=4/);assert.match(queue,/AVG\(api_calls\)/);assert.match(queue,/Math\.ceil\(Number\(average\?\.average/);assert.match(queue,/paused_until/);assert.match(queue,/DELETE FROM etsy_api_usage_buckets/);assert.match(queue,/DELETE FROM etsy_worker_runs/);
  assert.match(client,/retry-after/);assert.match(client,/Etsy asked Goldie to slow down/);assert.match(finish,/meter\.calls/);assert.match(finish,/apiCalls:meter\.calls/);
  assert.match(operations,/Etsy operations/);assert.match(operations,/Shared Etsy quota/);assert.match(operations,/Measured API cost/);assert.match(operations,/Failed listings/);assert.match(api,/retry_failed/);assert.match(api,/run_now/);assert.match(api,/isOwner/);
  assert.match(schema,/etsyQueueState/);assert.match(schema,/etsyWorkerRuns/);assert.match(migration,/etsy_queue_state/);assert.match(migration,/etsy_worker_runs/);
});

test("acknowledges slow workflow actions immediately and blocks repeat clicks",async()=>{
  const [workflow,page,mockups,styles]=await Promise.all([
    readFile(new URL("../app/factory-tools.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/integrated-mockups.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8"),
  ]);
  assert.match(workflow,/setPendingAction\(`recipe:\$\{recipe\.id\}`\)/);
  assert.match(workflow,/Loading product details…/);
  assert.match(workflow,/className="goldie-spinner"[\s\S]{0,120}Preparing \{included\.length\} products/);
  assert.match(workflow,/actionLock\.current/);
  assert.match(page,/aria-busy=\{preparingEtsy\}/);
  assert.match(page,/aria-busy=\{running\|\|preparingEtsy\|\|Boolean\(bundleRun\)\}/);
  assert.match(page,/aria-busy=\{publishing\}/);
  assert.match(mockups,/aria-busy=\{busy\}/);
  assert.match(styles,/button\[aria-busy="true"\]/);
  assert.match(styles,/goldie-action-spin/);
});

test("centers the complete images and mockups heading group",async()=>{
  const styles=await readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8");
  assert.match(styles,/\.post-draft-workspace>\.post-draft-heading\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)!important;[\s\S]*?width:100%!important;[\s\S]*?justify-items:center!important/);
  assert.match(styles,/\.post-draft-workspace>\.post-draft-heading>div\{[\s\S]*?grid-column:1;[\s\S]*?justify-self:stretch!important;[\s\S]*?justify-items:center!important/);
  assert.match(styles,/\.post-draft-workspace>\.post-draft-heading>\.open-all-button\{[\s\S]*?grid-column:1;[\s\S]*?justify-self:center!important/);
});

test("renders final publishing readiness with the defined personalization validator",async()=>{
  const page=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
  assert.match(page,/files\.every\(file=>!personalizationProblem\(file\.etsy\)\)/);
  assert.doesNotMatch(page,/personalizationIssue\(/);
  assert.match(page,/missingPhotoDraftIds/);assert.match(page,/Product and design preview/);
  assert.doesNotMatch(page,/draft\.fileName/);
  assert.match(page,/async function selectRecipe\(recipe:Recipe\):Promise<TemplateDetails\|null>/);
  assert.doesNotMatch(page,/return Boolean\(await loadTemplateUrl/);
  assert.match(page,/if\(!localPreview\)await runBounded\(files,2/);
});

test("keeps each Printify editing action with its listing details",async()=>{
  const [page,styles]=await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8"),
  ]);
  assert.match(page,/tag-row[\s\S]*?draft\.editorUrl[\s\S]*?Open in Printify to resize or reposition[\s\S]*?<\/div><\/div>/);
  assert.match(styles,/div:not\(\.pending-preview\)>\.edit-draft-button\{margin:16px 0 0;align-self:flex-start\}/);
});

test("explains and styles every Printify photo selection action",async()=>{
  const [page,styles]=await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8"),
  ]);
  assert.match(page,/Remove every selected Printify photo from this listing only/);
  assert.match(page,/Choose the same Printify photos across the entire batch/);
  /* D465 · The save-as-default action is gone; the selection saves itself. */
  assert.doesNotMatch(page,/Preselect these photos whenever you use this saved product again/);
  assert.match(page,/Applied to every listing/);
  assert.doesNotMatch(page,/Saved for future batches/);
  assert.match(page,/printify-photo-lightbox/);
  assert.match(page,/Object\.fromEntries\(drafts\.filter\(item=>item\.id\)/);
  assert.match(styles,/image-pref-actions button\.confirmed/);
  assert.match(styles,/printify-image-picker>\.image-pref-actions\{[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(styles,/image-pref-actions button\{[\s\S]*?cursor:pointer/);
});

test("shows each saved mockup once with visible controls and a real enlarged preview",async()=>{
  const [page,styles]=await Promise.all([
    readFile(new URL("../app/mockups/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/mockups/management.css",import.meta.url),"utf8"),
  ]);
  const managementMarkup=page.slice(page.indexOf('managementSetList'),page.indexOf('{showAddSet&&'));
  assert.match(managementMarkup,/setPreview/);
  assert.match(managementMarkup,/items\.slice\(0,10\)/);
  assert.match(managementMarkup,/!open&&/);
  assert.match(managementMarkup,/savedMockupPreview/);
  assert.match(page,/libraryPreview\.src/);
  assert.match(page,/previewSavedSelection/);
  assert.match(styles,/\.managementSetList \.collectionActions \{[\s\S]*?position: static/);
  assert.match(styles,/\.savedMockupPreview \{/);
});

test("keeps lifestyle mockup creation specific to each listing",async()=>{
  const [mockups,styles]=await Promise.all([
    readFile(new URL("../app/integrated-mockups.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8"),
  ]);
  assert.match(mockups,/Create mockups for this listing/);
  assert.doesNotMatch(mockups,/Want the same scenes on the rest of the batch/);
  assert.doesNotMatch(mockups,/Use this selection for every listing/);
  assert.match(styles,/\.app-shell \.mockup-action-sequence\{display:grid/);
});

test("creates selected lifestyle mockups concurrently without changing scene order",async()=>{
  const mockups=await readFile(new URL("../app/integrated-mockups.tsx",import.meta.url),"utf8");
  assert.match(mockups,/runBounded\(jobs,2/);
  assert.match(mockups,/made\.length!==chosen\.length/);
  assert.match(mockups,/completed\.entries\(\)\]\.sort/);
  assert.doesNotMatch(mockups,/for\(const t of chosen\)/);
  assert.doesNotMatch(mockups,/scene needs another try/);
  assert.match(mockups,/createPortal\(<div className="inline-lightbox"/);
});

test("requires a photo on every listing and lets sellers set Etsy photo order",async()=>{
  const [page,organizer,images,finish]=await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/listing-photo-order.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/etsy/images/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/etsy/finish.ts",import.meta.url),"utf8"),
  ]);
  assert.match(page,/missingPhotoDraftIds/);
  assert.match(page,/missing-photo-modal/);
  assert.match(page,/Go to this listing/);
  assert.match(page,/Product and design preview/);
  assert.match(page,/createdListingsMissingImages\(\)/);
  assert.match(page,/preparedMockupCounts\[draft\.id\]/);
  assert.match(page,/if\(imageStepError&&allCreatedListingsHaveImages\(\)\)/);
  assert.match(page,/At least one image on every selected listing/);
  assert.match(page,/Personalization settings/);
  assert.match(organizer,/draggable/);
  assert.match(organizer,/Rearrange listing photos/);
  assert.match(organizer,/onDragEnter/);
  assert.match(organizer,/orderRef\.current/);
  assert.match(organizer,/Move \$\{photo\.name\} earlier/);
  assert.match(organizer,/Photo order saved in preview/);
  assert.match(images,/order\.json/);
  assert.match(finish,/form\.set\("rank",String\(rank\)\)/);
});

test("chooses exact available Printify colors per batch and remembers optional defaults",async()=>{
  const [page,printify,drafts,recipes,css]=await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/printify/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/printify/drafts/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/product-recipes/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/globals.css",import.meta.url),"utf8"),
  ]);
  assert.match(page,/<h3>Colors<\/h3>/);
  assert.match(page,/Choose at least one available color before continuing/);
  assert.match(page,/Save these as this product’s default colors/);
  assert.match(page,/selectedVariantIds:pricedVariants\.map/);
  assert.match(printify,/enabledOtherIds/ /* D164: renamed — size is now selectable, so only the OTHER axes stay gated */);
  assert.match(printify,/availableColorIds/);
  assert.match(printify,/templateEnabled:Boolean\(variant\.is_enabled\)/);
  assert.match(drafts,/body\.selectedVariantIds\.includes\(id\)/);
  assert.match(recipes,/defaultColorIds/);
  assert.match(css,/\.product-color-selector/);
});

test("makes Printify publishing, editor links, and shipping differences explicit", async () => {
  const [page,tools,css] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/factory-tools.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/clarity-pass.css",import.meta.url),"utf8"),
  ]);
  assert.match(tools, /Publish the product to Etsy first/);
  assert.match(tools, /Copy the URL only from the Printify design editor/);
  assert.match(page, /Your Etsy buyer charge is/);
  assert.doesNotMatch(page, /<span>Shipping remains separate from the item-profit/);
  assert.match(css, /\.workflow-back[\s\S]*text-decoration: none !important/);
});

test("keeps buyer-paid shipping separate from item profit",async()=>{
  const page=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
  assert.match(page,/Lowest estimated item profit/);
  assert.match(page,/Shipping not included/);
  assert.match(page,/Buyer-paid shipping stays separate/);
  assert.doesNotMatch(page,/estimatedProfit\([^)]*shipping/i);
});

test("protects batch allowance and lets sellers review uploaded designs",async()=>{
  const [page,styles]=await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8"),
  ]);
  assert.match(page,/planDraftsRemaining/);
  assert.match(page,/Plan allowance/);
  assert.match(page,/removeDesign/);
  assert.match(page,/design-upload-review/);
  assert.match(styles,/\.design-upload-review article\{grid-template-columns:76px/);
  assert.match(styles,/\.design-upload-review img\{width:76px!important;height:76px/);
});

test("remembers safe Etsy product defaults without design-specific assumptions",async()=>{
  const [page,recipes,styles]=await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/product-recipes/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/globals.css",import.meta.url),"utf8"),
  ]);
  assert.match(page,/PHYSICAL_ETSY_FIELDS/);
  assert.match(page,/productEtsyDefaults/);
  assert.match(page,/etsyDefaults/);
  assert.match(page,/derived\["Clothing style"\]/);
  assert.match(page,/derived\.Size="Unisex"/);
  assert.match(page,/if\(firstPrepared\)await rememberEtsyDefaults\(firstPrepared\)/);
  assert.match(page,/className="etsy-details-editor"/);
  /* Was "{completed.length} of {properties.length} set". Every attribute on a
   * tee is optional, so that fraction read as 45% done and invented work that
   * did not exist. Now counts required fields, or says the rest are optional.
   * See D112. */
  assert.match(page,/required\.length\?`\$\{requiredDone\.length\} of \$\{required\.length\} required set`/);
  assert.match(recipes,/etsyDefaults/);
  assert.match(styles,/\.etsy-details-editor>summary/);
});

test("keeps the saved-product batch page compact and makes permanent settings editable",async()=>{
  const [page,tools,recipes,styles]=await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/factory-tools.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/product-recipes/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/globals.css",import.meta.url),"utf8"),
  ]);
  assert.match(page,/remembered-color-row/);
  assert.match(page,/Change colors/);
  assert.match(page,/product-mockup-scenes/);
  /* D209: shipping is no longer a batch-level control. It opens in the
     readiness card, labelled with the product it belongs to, because in a
     bundle "for this batch" was a single product's value wearing the batch's
     name. */
  /* D223 · the shipping select is the pricing panel's, labelled for the product. */
  assert.match(page,/Etsy shipping profile/);
  /* D232 · the settings block that held it is gone; the description lives on the
     Listing page. */
  assert.match(page,/Description for every listing|descriptionOverride/);
  assert.match(page,/Save this description as the default/);
  assert.match(page,/else if\(!pricedVariants\.length\)/);
  /* D152: "Rename / reconnect" was DOM text hidden under a CSS ::after reading
   * "Rename" — and that same rule also relabelled the bundle's "Edit bundle"
   * button. The button is now plain "Edit" with the full meaning in its title. */
  assert.match(tools,/className="edit-recipe" title="Rename this product or reconnect its Printify template"/);
  /* D212: Cancel is gated on `editing`, not `editingId` — adding a product had
     no way out because editingId is empty until you edit an existing one. */
  assert.match(tools,/editing&&<button[^>]+secondary-action/);
  assert.match(recipes,/const description=body\.description!==undefined\?String\(body\.description/);
  assert.match(styles,/\.remembered-color-row/);
  assert.match(styles,/@media\(min-width:821px\) and \(max-width:1050px\)/);
});

test("lets a seller name and resume a finished batch without publishing it",async()=>{
  const [page,history,css]=await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/batches/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/globals.css",import.meta.url),"utf8"),
  ]);
  assert.match(page,/Keep as Printify drafts for now/);
  assert.match(page,/suggestedBatchName/);
  assert.match(page,/Save to Batch History/);
  assert.match(page,/Great—this batch is waiting for you/);
  /* D386 · A draft is saved from wherever the seller is, so it records the step
     they are actually on rather than always claiming "finish". */
  assert.match(page, /status:"draft",step:workflowStep/);
  assert.match(page,/keptAsDrafts\?"draft"/);
  assert.match(history,/\/listing-factory\?batch=/);
  assert.match(history,/batch\.display_name/);
  assert.match(history,/Printify drafts/);
  assert.match(css,/\.keep-drafts-button/);
  assert.match(css,/\.save-draft-modal/);
});

test("makes Batch History visual, identifiable, reversible, and truthful",async()=>{
  const [history,route,styles]=await Promise.all([
    readFile(new URL("../app/batches/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/batches/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/batch-history.css",import.meta.url),"utf8"),
  ]);
  assert.match(route,/designName/);assert.match(route,/thumbnail_url/);assert.match(route,/state\.keptAsDrafts/);
  assert.match(history,/batch-history-thumbnail/);assert.match(history,/Permanently remove/);assert.match(history,/confirmAction\(\{/);
  assert.match(history,/Open published batch/);assert.match(history,/batch\.status==="complete"\?"&open=results":""/);
  assert.match(styles,/\.batch-history-thumbnail/);assert.match(styles,/\.batch-history-controls/);
});

test("D220: the rail is four stages, and every legacy phase has a home",async()=>{
  const page=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

  /* This test used to pin the Finish subrail: four phases nested under a fifth
     bubble. The workflow is four pages now - Product, Images, Listing, Publish -
     so the subrail is gone and its phases were merged onto those pages.
     What matters is that no legacy index was orphaned by the merge. */
  const stages=page.slice(page.indexOf("const RAIL_STAGES"),page.indexOf("const RAIL_TOP"));
  assert.match(stages,/\{label:"Product",index:1,.*covers:\[1\]\}/);
  assert.match(stages,/\{label:"Images",index:2,.*covers:\[2,3,4,7\]\}/,
    "designs, draft creation and mockups share the Images page");
  assert.match(stages,/\{label:"Listing",index:5,.*covers:\[5,6\]\}/,
    "titles and Etsy details share the Listing page");
  assert.match(stages,/\{label:"Publish",index:8,.*covers:\[8\]\}/);

  const covered=[...stages.matchAll(/covers:\[([0-9,]+)\]/g)].flatMap(m=>m[1].split(",").map(Number));
  for(const index of [1,2,3,4,5,6,7,8]){
    assert.ok(covered.includes(index),`PROGRESS_STEPS index ${index} has no page`);
  }
});

test("does not make owner access depend on billing database initialization",async()=>{
  const route=await readFile(new URL("../app/listing-factory/page.tsx",import.meta.url),"utf8");
  assert.match(route,/if \(isOwner\(user\)\) return <ListingFactoryClientEntry\/>;/);
  assert.match(route,/mastermind = await mastermindState\(user\);/);
  assert.doesNotMatch(route,/Promise\.all\(\[\s*billingState\(user\),\s*mastermindState\(user\)/);
});

test("keeps every owner login and billing outage from crashing the factory route",async()=>{
  const [access,route]=await Promise.all([
    readFile(new URL("../app/mastermind/access.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/listing-factory/page.tsx",import.meta.url),"utf8"),
  ]);
  assert.match(access,/goldie@beawolfbiz\.com/);
  assert.match(route,/try \{\s*billing = await billingState\(user\);\s*\} catch \(error\) \{/);
  assert.match(route,/billing access[\s\S]*return <SignupClient signedIn/);
});

test("keeps the Listing Factory application outside route modules",async()=>{
  const [rootRoute,factoryRoute,clientEntry]=await Promise.all([
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/listing-factory/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/listing-factory/client-entry.tsx",import.meta.url),"utf8"),
  ]);
  assert.match(rootRoute,/export \{ default \} from "\.\/listing-factory-app"/);
  assert.match(factoryRoute,/from "\.\/client-entry"/);
  assert.match(clientEntry,/from "@\/app\/listing-factory-app"/);
  assert.match(clientEntry,/if \(!browserReady\)/);
  assert.doesNotMatch(factoryRoute,/from "@\/app\/page"/);
});

test("passes the defined saved-product selector into the product workflow",async()=>{
  const app=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
  assert.match(app,/async function chooseRecipe\(recipe: Recipe\)/);
  assert.match(app,/onUseRecipe=\{chooseRecipe\}/);
  assert.doesNotMatch(app,/onUseRecipe=\{useRecipe\}/);
});

test("does not crash when the production worker starts without injected bindings",async()=>{
  const worker=await readFile(new URL("../worker/index.ts",import.meta.url),"utf8");
  assert.match(worker,/if\(env\?\.DB&&url\.pathname==="\/api\/printify\/drafts\/publish"\)/);
  assert.doesNotMatch(worker,/if\(env\.DB&&url\.pathname==="\/api\/printify\/drafts\/publish"\)/);
});

test("records startup failures before the Listing Factory bundle mounts",async()=>{
  const [layout,route]=await Promise.all([
    readFile(new URL("../app/layout.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/client-errors/route.ts",import.meta.url),"utf8"),
  ]);
  assert.match(layout,/window\.addEventListener\('error'/);
  assert.match(layout,/window\.addEventListener\('unhandledrejection'/);
  assert.match(layout,/navigator\.sendBeacon\('\/api\/client-errors'/);
  assert.match(route,/\[listing-factory-client-startup\]/);
  assert.match(route,/return new NextResponse\(null, \{ status: 204 \}\)/);
});

test("counts every bundle product as a separate listing, without a native prompt",async()=>{
  const app=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

  /* Selecting a bundle used to fire window.prompt("How many designs are in this
   * batch?") followed by up to three more native dialogs, and stored the answer
   * only to block the seller later if her upload did not match it ("The bundle
   * total changed"). Measured live: the prompt blocks the renderer, so the page
   * appears frozen.
   *
   * The upload-time guard already multiplies designs by products against the
   * remaining allowance and explains it in the page, so the prediction was
   * redundant and its only unique effect was a failure the seller could not
   * avoid. See D129. */
  assert.doesNotMatch(app,/window\.prompt/,"Selecting a bundle must not open a native prompt.");
  assert.doesNotMatch(app,/How many designs are in this/);
  assert.doesNotMatch(app,/The bundle total changed/);
  assert.doesNotMatch(app,/bundlePlannedDesignCount/i,"Removing the prediction must also remove every reference to its setter.");

  // the real protection stays, in the page, at upload time
  assert.match(app,/requestedListingCount>planDraftsRemaining/);
  assert.match(app,/designs × \$\{bundleProductCount\} products = \$\{requestedListingCount\} listings/);
  assert.match(app,/Math\.floor\(planDraftsRemaining\/bundleProductCount\)/);
});

test("keeps bundle titles, placement decisions, review, and failures product-specific",async()=>{
  const [app,workflow,review]=await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/factory-tools.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/final-listing-review.tsx",import.meta.url),"utf8"),
  ]);
  assert.match(workflow,/bundle-as-product/);
  assert.match(app,/autoTitleForDesign\(file,bank\.keywords,titleJoiner===", ",nextDetails\)/);
  assert.match(app,/bundleQualityIssues/);
  /* D167 groups these per design instead of per design-AND-product. */
  assert.match(app,/is below the recommended size for <strong>\{productList\.join\(", "\)\}/);
  assert.match(app,/Proceed anyway/);
  assert.match(app,/Exclude this listing/);
  assert.match(app,/Nothing is skipped silently/);
  assert.match(app,/dpi<215/);
  assert.match(app,/VERY LOW RESOLUTION/);
  assert.match(app,/below 215 DPI/);
  assert.match(app,/selectedPublishDrafts\(\)/);
  assert.match(app,/allCreatedListingsHaveImages\(selectedPublishDrafts\(\)\)/);
  assert.match(app,/Anything still needing a look is listed above/);
  assert.match(app,/status: "NeedsRetry"/);
  assert.match(review,/final-design-group/);
  assert.match(review,/Choose exactly which listings to publish/);
  assert.match(review,/\/140 characters/);
  assert.match(review,/\/13 tags/);
  assert.match(review,/Retry this listing/);
});

test("renders every Finish phase as compact expandable rows",async()=>{
  const [css,review]=await Promise.all([readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8"),readFile(new URL("../app/final-listing-review.tsx",import.meta.url),"utf8")]);
  assert.match(css,/Finish workspace: dense rows with one in-place editor/);
  assert.match(css,/\.listing-editor \.design-line/);
  assert.match(css,/\.design-line:not\(\.active\) \.individual-title-builder/);
  assert.match(css,/\.etsy-detail-card/);
  assert.match(css,/\.post-draft-workspace \.draft-card-top/);
  assert.match(css,/\.final-listing-card/);
  assert.match(review,/loading="lazy"/);
});

test("restores completed draft batches to reachable Finish results (fixes D53)",async()=>{
  const [app,batches]=await Promise.all([readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),readFile(new URL("../app/batches/page.tsx",import.meta.url),"utf8")]);
  assert.match(app,/hasCreatedDrafts=complete&&drafts\.some\(draft=>draft\.status==="Created"\)/);
  assert.match(app,/if\(!pricingApproved\)setPricingApproved\(true\)/);
  assert.match(app,/url\.searchParams\.set\("step","finish"\)/);
  assert.match(app,/setWorkflowStep\("finish"\)/);
  assert.match(app,/setPricingApproved\(Boolean\(state\.pricingApproved\)\|\|Boolean\(state\.complete&&\(state\.drafts\|\|\[\]\)\.some\(draft=>draft\.status==="Created"\)\)\)/);
  assert.match(batches,/&open=results/);
});

test("shows underfilled titles and tags as a non-blocking review state (fixes D64, recoloured D153)",async()=>{
  const [app,review,css]=await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/final-listing-review.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8"),
  ]);
  assert.match(review,/design\.title\.trim\(\)\.length<100/);
  assert.match(review,/design\.tags\.length<13/);
  assert.match(review,/publishing is still available/);
  assert.match(review,/review\.needed\?"content-review":"ready"/);
  /* D255 · This used to be "One or more titles need review" — vaguer than the
     rows immediately below it, which name every listing individually. The
     checklist now counts them, so the summary is at least as specific as the
     detail it summarises. */
  assert.match(app,/under 100 characters/); // D490 singularises this line
  assert.match(app,/\$\{files\.filter\(file=>file\.title\.trim\(\)\.length<100\)\.length\} of \$\{files\.length\}/,
    "the checklist must count the listings that need review");
  assert.match(app,/listings have fewer than 13 tags/);
  assert.match(app,/\$\{files\.filter\(file=>file\.tags\.length<13\)\.length\} of \$\{files\.length\}/,
    "and must count them, the same as the titles line");
  /* D153 recoloured this from the gold-era #8a5a12 to the app's plum. The point
   * of D64 is that it is a distinct non-blocking review state, not that it is amber. */
  assert.match(css,/\.final-listing-card \.content-review\{color:#8a3f66!important/);
  assert.doesNotMatch(review,/review\.needed[^\n]{0,200}disabled/);
});

test("keeps a forward path from setup, designs, and pricing after drafts exist (fixes D1)",async()=>{
  const app=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
  /* D383 · Was 3. The setup step's forward button used to relabel itself to
     "Back to finishing your listings" when drafts already existed; it says
     "Next step" now and still routes to finish. The two remaining are the
     batch-actions links, which are not the forward button. */
  /* D402 · Was 2, and the setup button used to branch on `complete` to jump
     straight to finishing. Renaming it "Next step" made that jump wrong - it
     skipped Images. Next step goes to the next step; the rail is how you jump. */
  assert.equal((app.match(/Back to finishing your listings/g)||[]).length,2);
  assert.match(app,/onClick=\{\(\)=>goToStep\("designs"\)\}/,
    "the setup step's forward goes to Images, always");
  /* mockupTheme was removed from this gate. Mockups are optional - the Finish
   * step selects listing images separately - and requiring one made "No mockups
   * for this batch" unreachable: choosing it disabled the only way forward.
   * See D110. */
  assert.match(app,/disabled=\{!complete&&Boolean\(productStepBlocker\(\)\)\}/  /* D164 sizes, D181 per-product keyword banks */);
  /* D402 · The setup forward no longer branches on `complete`; it always goes to
     Images. The route back to finishing lives in batch-actions. */
  assert.match(app,/className="batch-actions"[\s\S]{0,500}Back to finishing your listings/);
  assert.match(app,/files\.length>0&&complete&&workflowStep==="designs"/);
  assert.match(app,/className="batch-actions"[\s\S]{0,500}Back to finishing your listings/);
});

/* D369 · These moved from descendant to child selectors. `order` only applies
   to direct children, so the descendant form ordered nothing and leaked onto
   nested elements instead — see stylesheet-liveness.test.mjs. */
test("orders designs before colours, mockups, and saved settings on the batch screen (fixes D2)",async()=>{
  const [app,css]=await Promise.all([readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8")]);
  assert.match(app,/BatchPreferencesPortal/);
  assert.match(app,/id="batch-preferences-after-designs"/);
  assert.match(app,/useEffect\(\(\)=>setTarget\(document\.getElementById\("batch-preferences-after-designs"\)\)\);/);
  assert.match(css,/\.steps-column\.setup-column>\.designs-step\{order:20\}/);
  assert.match(css,/\.steps-column\.setup-column>\.batch-preferences-after-designs\{order:30/);
  assert.match(css,/\.steps-column\.setup-column>\.color-default-block\{order:30/);
  assert.match(css,/\.steps-column\.setup-column>\.mockup-default-block\{order:40/);
  assert.match(css,/\.steps-column\.setup-column>\.everything-else\{order:50/);
});

test("keeps product creation visible and lets a selected product be changed (fixes D4 and D5)",async()=>{
  const [app,workflow,css]=await Promise.all([readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),readFile(new URL("../app/factory-tools.tsx",import.meta.url),"utf8"),readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8")]);
  assert.match(workflow,/＋ Add a new product/);
  assert.match(workflow,/className="change-product"[\s\S]{0,300}Change product/);
  assert.match(workflow,/onChangeProduct: \(\) => boolean/);
  assert.match(workflow,/useEffect\(\(\)=>setActiveId\(props\.selectedProductId\),\[props\.selectedProductId\]\)/);
  assert.match(app,/onChangeProduct=\{changeProduct\}/);
  assert.match(app,/selectedProductId=\{activeBundle\?`bundle:\$\{activeBundle\.id\}`:activeRecipe\?\.id\|\|""\}/);
  assert.match(app,/function changeProduct\(\)[\s\S]{0,400}clearCurrentBatch\(true\);return true/);
  assert.doesNotMatch(css,/data-product-selected="true"\] \.recipe-library-head/);
});

test("records real pricing approval and invalidates it after edits (fixes D23 and D65)",async()=>{
  const app=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
  assert.match(app,/Approve prices and shipping/);
  assert.match(app,/onClick=\{\(\)=>onApprovalChange\(true\)\}/);
/* D353 · The standalone pricing card is gone — pricing is a panel on the
     product card now, so this handler runs through the card's branch. What the
     test is really about is that changing pricing invalidates approval, and it
     still does. */
  assert.match(app,/if\(isActive\)\{setPricing\(value\);setPricingApproved\(false\)\}/);
  assert.match(app,/if\(isActive\)\{setVariantPrices\(value\);setPricingApproved\(false\)\}/);
  assert.match(app,/pricingApproved\?"✓ Prices and buyer-paid shipping were approved":"! Prices and buyer-paid shipping need review"/);
  assert.match(app,/setPricingApproved\(Boolean\(state\.pricingApproved\)\|\|Boolean\(state\.complete&&\(state\.drafts\|\|\[\]\)\.some\(draft=>draft\.status==="Created"\)\)\)/);
  assert.doesNotMatch(app,/if\(complete&&drafts\.some\(draft=>draft\.status==="Created"\)&&!pricingApproved\)setPricingApproved\(true\)/);
  assert.doesNotMatch(app,/✓ Every enabled variation and price was reviewed/);
});

test("shows one binding design-capacity status after uploads (fixes D28 and D49)",async()=>{
  const app=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
  assert.match(app,/files\.length > 0 && designsFinished && <div className="batch-capacity">/);
  assert.match(app,/\$\{files\.length\} of \$\{batchDesignLimit\} designs ready · \$\{additionalDesignsAvailable\} more available · \$\{planDraftsRemaining\} listings left on your plan/);
  assert.match(app,/!files\.length&&<p className="batch-limits"/);
  assert.match(app,/files\.length>0&&!designsFinished&&<section className="design-preparation-status working"/);
  assert.doesNotMatch(app,/All \$\{files\.length\} designs are ready/);
  assert.doesNotMatch(app,/\$\{files\.length\} of 20 designs ready/);
});

test("names every listing missing a required photo (fixes D33)",async()=>{
  const app=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
  assert.match(app,/missingPhotoDraftIds\.map\(clientId=>/);
  assert.match(app,/design\?\.name\|\|draft\?\.name\|\|"Listing"/);
  assert.match(app,/Product and design preview/);
  assert.match(app,/jumpToMissingPhotoListing\(clientId\)/);
});

test("counts and caps every listing at Etsy's 20-photo limit (fixes D67)",async()=>{
  const app=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
  assert.match(app,/slotsLeft=Math\.max\(0,20-reservedPhotos-selected\.size\)/);
  assert.match(app,/Etsy allows 20 listing photos/);
  assert.match(app,/disabled=\{!selected\.has\(index\)&&atLimit\}/);
  assert.match(app,/reservedPhotos=\{\(preparedMockupCounts\[draft\.id\|\|""\]\|\|0\)\+\(design\?\.sizeGuideName\|\|sizeGuideName\?1:0\)\}/);
  assert.match(app,/values\.slice\(0,Math\.max\(0,20-reserved\)\)/);
});

test("uses one deterministic Etsy product baseline across a batch (fixes D71)",async()=>{
  const app=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
  assert.match(app,/etsyProductBaseline=useRef/);
  assert.match(app,/runBounded\(pending,1,/);
  assert.match(app,/prepared=baseline\?\{\.\.\.initial,taxonomyId:baseline\.taxonomyId,category:baseline\.category,attributes:\{\.\.\.initial\.attributes,\.\.\.baseline\.attributes\}\}:initial/);
  assert.match(app,/etsyProductBaseline\.current=\{taxonomyId:details\.taxonomyId,category:details\.category,attributes:physical\}/);
  assert.match(app,/etsyProductBaseline\.current=null;[\s\S]{0,1200}?setActiveRecipe\(recipe\)/);
});

test("rejects over-capacity uploads before creating a batch record (fixes D54)",async()=>{
  const app=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
  const capacity=app.indexOf("if(unique.length>available)");
  const batchId=app.indexOf("const durableBatchId=batchIdRef.current||crypto.randomUUID()",capacity);
  assert.ok(capacity>0&&batchId>capacity);
  assert.match(app,/Math\.min\(MAX_BATCH_FILES-files\.length,batchDesignLimit-files\.length\)/);
  assert.match(app,/No designs were added and no batch was created/);
  assert.match(app,/Choose \$\{available\} or fewer so nothing is partially added/);
});

test("traverses every workflow phase with one shared gate and never enables an inert control (fixes D73)",async()=>{
  const blank={connected:false,etsyConnected:false,productSelected:false,templateReady:false,shippingReady:false,variantsReady:false,colorsReady:false,pricesReady:false,designCount:0,designsReady:false,etsyShippingProfileReady:false,pricingApproved:false,draftsComplete:false,createdDraftCount:0,titlesReady:false,tagsReady:false,descriptionReady:false,etsyDetailsReady:false,personalizationReady:false,imagesReady:false};
  const designs={...blank,connected:true,etsyConnected:true,productSelected:true,templateReady:true,shippingReady:true,variantsReady:true,bundleProductsReady:true,colorsReady:true,pricesReady:true,designCount:3,designsReady:true};
  const drafts={...designs,etsyShippingProfileReady:true,bundleProductsReady:true,pricingApproved:true,draftsComplete:true,createdDraftCount:3,titlesReady:true,tagsReady:true,descriptionReady:true};
  const complete={...drafts,etsyDetailsReady:true,personalizationReady:true,imagesReady:true};
  assert.deepEqual(navigationIssues(0,blank),[]);
  for(const index of [0,1,2,3])assert.deepEqual(navigationIssues(index,designs),[]);
  for(const index of [0,1,2,3,4,5,6])assert.deepEqual(navigationIssues(index,drafts),[]);
  for(const index of [0,1,2,3,4,5,6,7,8])assert.deepEqual(navigationIssues(index,complete),[]);
  assert.match(navigationIssues(7,drafts).join(" "),/Etsy details/);
  assert.match(navigationIssues(8,{...complete,imagesReady:false}).join(" "),/photo/);
  const app=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
  assert.match(app,/disabled=\{!active&&Boolean\(issues\.length\)\}/);
  /* D220: the rail composes its own status line, so the fallback now reads
     issues[0] || `${progressStatus(...)}${draftLine}`. The rule is unchanged -
     a gate issue always wins over a computed status. */
  assert.match(app,/issues\[0\]\|\|`\$\{progressStatus/);
  assert.match(app,/disabled=\{preparingEtsy\|\|progressGateIssues\(6\)\.length>0\}/);
  assert.match(app,/function markShippingEdit\(\)\{onApprovalChange\(false\)/);
  assert.doesNotMatch(app,/if\(!selectedProfile\|\|customDirty\)onApprovalChange/);
});

test("uses one management navigation vocabulary everywhere (fixes D84)",async()=>{
  const nav=await readFile(new URL("../app/management-nav.tsx",import.meta.url),"utf8");
  assert.match(nav,/label:"Mockup Library"/);
  assert.match(nav,/label:"Usage \+ Plan"/);
  for(const page of ["batches","keywords","mockups","usage"]){
    const source=await readFile(new URL(`../app/${page}/page.tsx`,import.meta.url),"utf8");
    assert.match(source,/ManagementNav/);
  }
});

test("expands keyword cards and aligns their actions (fixes D85 and D86)",async()=>{
  const page=await readFile(new URL("../app/keywords/page.tsx",import.meta.url),"utf8");
  const css=await readFile(new URL("../app/globals.css",import.meta.url),"utf8");
  assert.match(page,/className="bank-keyword-toggle" aria-expanded=\{expanded\}/);
  assert.match(page,/Show all \$\{list\.keywords\.length\} phrases/);
  assert.match(css,/\.bank-grid article\{display:flex;flex-direction:column\}/);
  assert.match(css,/\.bank-grid \.edit-bank\{margin-top:auto\}/);
});

test("confirms and visually quiets destructive mockup deletion (fixes D87)",async()=>{
  const page=await readFile(new URL("../app/mockups/page.tsx",import.meta.url),"utf8");
  const css=await readFile(new URL("../app/mockups/management.css",import.meta.url),"utf8");
  assert.match(page,/Delete “\{deletingTheme\}”\?/);
  assert.match(page,/Yes, delete set/);
  assert.match(css,/\.managementSetList \.collectionActions \.deleteSet \{[\s\S]*?min-width: auto;[\s\S]*?background: transparent;[\s\S]*?text-decoration: underline/);
});

test("reports published listings instead of workflow completion (fixes D88)",async()=>{
  const api=await readFile(new URL("../app/api/batches/route.ts",import.meta.url),"utf8");
  const page=await readFile(new URL("../app/batches/page.tsx",import.meta.url),"utf8");
  const app=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
  assert.match(api,/published_count:Math\.max\(Number\(publishedByBatch\[String\(row\.id\)\]\)\|\|0,Number\(state\.batchReceipt\?\.publishedCount\)\|\|0\)/);
  /* D225 · "DRAFTS READY" was the fallback for every unpublished batch, whether
     or not a draft existed. Measured across all 17 saved batches: none had a
     draft in its snapshot and all 17 claimed drafts were ready. The label now
     counts them, and says so plainly when there are none. */
  assert.match(api,/draft_count:\(state\.drafts\|\|\[\]\)\.length/);
  /* D386 · Batch History says what the seller asked for: a batch is a DRAFT
     until it is published, then it says how many went live to Etsy. */
  assert.match(page,/batch\.published_count>0\?`\$\{batch\.published_count\} PUBLISHED TO ETSY`:`DRAFT`/);
  /* D386 · "SAVED · NOT YET DRAFTED" is now just "DRAFT" - see above. */
  assert.doesNotMatch(page,/SAVED · NOT YET DRAFTED/);
  assert.doesNotMatch(page,/status\.replace\("_"," "\)/);
  assert.match(app,/keptAsDrafts,batchReceipt\}/);
  assert.match(app,/keptAsDrafts,batchReceipt\]\);/);
});

test("retries thin AI title output once and then rejects the row (fixes D77)",async()=>{
  const route=await readFile(new URL("../app/api/listing-intelligence/route.ts",import.meta.url),"utf8");
  const app=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
  assert.match(route,/minimumTitlePhrases=titleCandidates\.length>=8\?8:1/);
  assert.match(route,/requiredTagCount=Math\.min\(13,tagCandidates\.length\)/);
  assert.match(route,/selection=await requestSelection\(0\);if\(selection\.selected\.length<minimumTitlePhrases\|\|selection\.tags\.length<requiredTagCount\)selection=await requestSelection\(1\)/);
  /* The retry still fires on phrase count — cheap and harmless. But the row is
   * only REJECTED on the assembled title's length. Gating rejection on phrase
   * count failed 2 of 3 real listings, one at "7 of 8 required title phrases
   * and 13 of 13 available Etsy tags". See D77 in DEFECTS.md. */
  assert.match(route,/const titleIsShort=couldHaveDoneBetter&&title\.length<TITLE_FILL_FLOOR;/);
  assert.match(route,/Short title \\u2014 few phrases in this bank match this design\./);
  assert.doesNotMatch(route,/tagCandidates\.filter\(candidate=>!rankedTags\.includes\(candidate\)\)/);
  assert.match(app,/titleError:item\.error/);
  assert.match(app,/each affected listing explains why below/);
  assert.match(app,/Boolean\(file\.title\.trim\(\)\)&&!file\.titleError/);
  assert.match(app,/file\.tags\.length>0&&!file\.titleError/);
  assert.match(app,/change\.title!==undefined&&change\.titleError===undefined/);
});

  /* D403 · Two faith designs against a bachelorette bank: one was refused, the
     other was titled from every phrase in it. The outcome depended only on
     whether the vision model happened to select anything, because the relevance
     check ran afterwards and merely warned. It decides first now, and a verified
     mismatch is refused every time. The warning survives for the one case Goldie
     cannot check: a design with no readable text. */
test("warns on the exact listing when its bank misses the design text (fixes D76)",async()=>{
  const route=await readFile(new URL("../app/api/listing-intelligence/route.ts",import.meta.url),"utf8");
  const app=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
  assert.match(route,/design_text/);
  assert.match(route,/bankFitForDesign\(titleCandidates,designSignals\)/);
  /* D230 · Same rule, corrected wording. This warning fires when the bank does
     not match the ARTWORK, but a title has already been built from that bank —
     so the old text printed "No phrase in this bank matches this design"
     directly beneath a finished title made from nine of its phrases. */
  assert.match(route,/Goldie could not read any text in this design, so it could not check the bank\./);
  assert.match(app,/className="title-match-warning" role="status"/);
  assert.match(app,/titleWarning:item\.result\.titleWarning/);
});

test("the Etsy category select always shows the category that is set — D106", async () => {
  const page = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* `etsyCategories` is only populated by the taxonomy fetch that runs during
   * auto-detection. On a RESTORED batch the saved details carry taxonomyId and
   * the category path, but the list is empty — so the select rendered zero
   * options and appeared completely blank, while every attribute beneath it
   * showed a value and the caption read "These are Etsy's actual fields for the
   * selected category".
   *
   * The seller could neither see which category was set nor change it. */
  assert.match(page, /Boolean\(details\.taxonomyId\)&&!categories\.some\(category=>category\.id===details\.taxonomyId\)&&<option value=\{details\.taxonomyId\}>/,
    "A set category must still render an option when the category list has not loaded.");
  assert.match(page, /details\.category\|\|"Category already chosen for this listing"/);
});

test("changing Etsy category preserves compatible values and warns before clearing others — D103",async()=>{
  const page=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
  assert.match(page,/function preserveCompatibleEtsyProperties/);
  assert.match(page,/option\.value_id===previous\.valueId\|\|option\.name\.toLowerCase\(\)===previous\.value\.trim\(\)\.toLowerCase\(\)/);
  assert.match(page,/setPendingCategoryChange\(\{designId:design\.id,details,clearedCount:merged\.clearedCount\}\)/);
  assert.match(page,/Change category and clear \{pendingCategoryChange\.clearedCount\}/);
  assert.match(page,/Keep current category/);
  assert.match(page,/finishPhase!=="etsy"\|\|etsyCategories\.length/,
    "Restored batches must load the full category list so the visible category control can actually change.");
});

test("photo recommendations and defaults follow the saved product — D105",async()=>{
  const page=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
  assert.match(page,/function productPhotoGuide\(blueprintTitle:string,availableCount:number\)/);
  assert.match(page,/productFamily\(blueprintTitle\)/);
  assert.match(page,/Recommended photos for \{templateDetails\?\.blueprintTitle/);
  assert.match(page,/setPrintifyImageSelections\(defaults\)/);
  assert.doesNotMatch(page,/3 lifestyle model mockups/);
  assert.doesNotMatch(page,/Printify flatlays of each color offered/);
});

test("restart is visible everywhere and preserves a batch only after saving — D111", async () => {
  const [app, clarity] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8"),
  ]);
  assert.match(app, /workflow-restart-button[\s\S]{0,700}Start a new batch/);
  assert.match(app, /Save to Batch History \+ start new/);
  assert.match(app, /Discard this batch \+ start new/);
  assert.match(app, /clearCurrentBatch\(true,preserveSavedBatch\)/);
  assert.match(app, /if\(priorBatch&&!preserveSavedBatch&&!publishedThisBatch\)/);
  assert.match(app, /step:workflowStep/);
  assert.match(clarity, /\.app-shell \.workflow-restart-button\{/);
});

test("a title never repeats a phrase it already contains — D157", async () => {
  const route = await readFile(new URL("../app/api/listing-intelligence/route.ts", import.meta.url), "utf8");

  /* Measured on the Publish screen of batch 103d12f0 — all three live titles:
   *   "Vegas Bachelorette, ... Off The Market, Fresh Off The Market"        (130)
   *   "Bachelorette Girls Gone Mild, Girls Gone Mild, Fresh Off The Market,
   *    Off The Market, ... Shes Off The Market, ..."                        (139)
   *   "Bachelorette Girls Gone Mild, Girls Gone Mild, Bikinis And Martinis,
   *    Bikinis And Martinis Bachelorette, ..."                              (137)
   * `selected` is de-duplicated with a Set, which only catches EXACT repeats, so
   * "girls gone mild" and "bachelorette girls gone mild" both survived and landed
   * next to each other. "off the market" appeared inside three separate phrases.
   * On a 140-character Etsy title that is wasted space and reads as stuffing. */
  assert.match(route, /const normalisePhrase=\(value:string\)=>value\.toLocaleLowerCase\(\)/);
  assert.match(route, /const chosen=picked\.filter\(phrase=>\{const inner=normalisePhrase\(phrase\);/);
  assert.match(route, /outer\.length>inner\.length&&outer\.includes\(inner\)/);

  /* Re-run of the three real cases through the same predicate:
   *   7 phrases -> 6, 114 chars | 7 -> 5, 106 chars | 6 -> 4, 98 chars
   * all still over TITLE_FILL_FLOOR (90), and every dropped phrase survives as a
   * substring of one that was kept, so no keyword is lost. */
  const normalise = v => v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const keep = sel => sel.filter(p => { const i = normalise(p);
    return !sel.some(o => o !== p && normalise(o).length > i.length && normalise(o).includes(i)); });

  const live = ["Bachelorette Girls Gone Mild", "Girls Gone Mild", "Fresh Off The Market",
    "Off The Market", "She Said Yes", "Shes Off The Market", "Going To The Chapel"];
  const kept = keep(live);
  assert.ok(!kept.includes("Girls Gone Mild"), "the contained phrase must be dropped");
  assert.ok(kept.includes("Bachelorette Girls Gone Mild"), "the longer phrase must be kept");
  assert.ok(!kept.includes("Off The Market"));
  assert.ok(kept.join(", ").length >= 90, "the deduplicated title must still clear the fill floor");
  for (const dropped of live.filter(p => !kept.includes(p)))
    assert.ok(kept.some(k => normalise(k).includes(normalise(dropped))),
      `"${dropped}" was dropped without surviving inside a kept phrase`);
});

test("Batch History does not label a bundle with one member's product — D196", async () => {
  const route = await readFile(new URL("../app/api/batches/route.ts", import.meta.url), "utf8");

  /* A bundle batch stores the ACTIVE product's blueprint in product_title, so the
   * list showed "Unisex Midweight Softstyle Fleece Hoodie · 3 designs" for a
   * three-product bundle — naming one member as though it were the whole batch.
   * The row already parses state_json, so the bundle was knowable all along. */
  /* D511 added templateDetails to this shape so a batch with no drafts yet can
     still show its product's photo instead of a grey placeholder. */
  assert.match(route, /type BatchListState=\{templateDetails\?:\{previewImage\?:string;previewImages\?:string\[\]\};activeBundle\?:\{name\?:string\};bundleRecipes\?:unknown\[\]/);
  assert.match(route, /state\.activeBundle&&\(state\.bundleRecipes\|\|\[\]\)\.length>1\)\?`\$\{\(state\.bundleRecipes\|\|\[\]\)\.length\} products`/);
});

/* D214/D407 · D214 forced this picker open because a closed fold meant sellers
   published with no product photographs and no way to know. She has since asked
   for the opposite and for a clear reason: arriving on Images dropped you inside
   the first listing's photos before you had chosen what to work on. Nothing on
   this step expands itself now. The original risk is handled by the publish
   checklist, which names a listing with no photo before anything goes live. */
test("D407: nothing on the Images step expands itself", async () => {
  const page = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /<details className="printify-image-picker" open/,
    "arriving on a step should not open a fold for you");
  assert.match(page, /<details className="printify-image-picker"/);

  /* The guard that replaced it: publishing still cannot happen silently without
     photos. */
  assert.match(page, /Every selected listing has at least one photo/);
});

test("D226: a listing waiting for its title is not shown as a failure", async () => {
  const page = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8");

  /* Measured live: a freshly drafted batch showed "Etsy details still need to be
   * created" twice in red, each with a "Try this listing again" button, under a
   * green tick reading "Core listing information is ready for your review".
   * Three states on one screen, two of them wrong.
   *
   * Nothing was broken. Etsy details fill in automatically once a title exists,
   * and no titles had been created yet — so the correct state was "waiting", and
   * the retry button could not have succeeded. */
  assert.match(page, /className=\{design\.title\.trim\(\)\?"etsy-detail-error":"etsy-detail-pending"\}/);
  assert.match(page, /Waiting for this listing’s title\./);
  assert.match(page, /\{design\.title\.trim\(\)&&<button aria-busy=\{preparingListingId===design\.id\}/,
    "the retry button only appears when retrying could work");

  /* And the success banner must not claim readiness while listings are waiting. */
  assert.match(page, /\{files\.every\(file=>etsyRequiredComplete\(file\.etsy\)\)&&<div className="variant-transfer-note">/);

  assert.match(css, /\.app-shell \.etsy-detail-pending\{/);
});

test("D230: a warning never contradicts the title sitting above it", async () => {
  const api = await readFile(new URL("../app/api/listing-intelligence/route.ts", import.meta.url), "utf8");
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Measured live: a nautical design titled from a Jane Austen bank rendered
   * "No phrase in this bank matches this design" immediately below a finished
   * 120-character title built from nine phrases of that bank. The warning is
   * about the ARTWORK, not the phrases, and it read as a flat contradiction. */
  assert.doesNotMatch(api, /No phrase in this bank matches this design/);
  assert.match(api, /Goldie could not read any text in this design, so it could not check the bank\./);

  /* And the count message must agree with itself: "1 titles created" was live. */
  assert.match(app, /\$\{files\.length-failed===1\?"title":"titles"\} created/);
  assert.match(app, /\$\{failed===1\?"needs":"need"\} another try/);
});

/* D364 · Clearing test batches meant one confirm dialog per batch. A checkbox on
   every card and one Delete above them makes it a single decision. */
test("Batch History can select and delete several at once — D364", async () => {
  const page = await readFile(new URL("../app/batches/page.tsx", import.meta.url), "utf8");

  assert.match(page, /className="batch-select"/, "every card carries a checkbox");
  assert.match(page, /className="batch-select-all"/);
  assert.match(page, /node\.indeterminate=selected\.length>0&&selected\.length<batches\.length/,
    "select-all shows a partial state rather than lying");

  /* One confirmation for the whole set, carrying the same warning the single
     delete gives. */
  assert.match(page, /Permanently remove \$\{chosen\.length\}/);
  /* D452 · Same promise, said once and in the app's own dialog. */
  assert.match(page, /Products already created in Printify are not deleted/);

  /* A partial failure must not pretend the survivors are gone. */
  assert.match(page, /if\(response\.ok\)removed\.push\(batch\.id\)/);
  assert.match(page, /setBatches\(current=>current\.filter\(item=>!removed\.includes\(item\.id\)\)\)/);
});

/* D377 · The publish checklist printed the raw Etsy profile title, so a real
   profile name rendered as "Standard: SwiftPOD, Kids clothes, Long-sleeve,
   T-Shirt, Tank Top, V-neck, Bags, Trous... will be applied automatically" —
   a name truncated mid-word inside a sentence. friendlyShippingProfileTitle
   already existed to collapse exactly this; the checklist just was not using it. */
test("D377: the publish checklist names the shipping profile readably", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  assert.match(app, /✓ \{friendlyShippingProfileTitle\(etsyShippingProfiles\.find\(profile=>profile\.id===etsyShippingProfileId\)\?\.title\)/);
  assert.doesNotMatch(app, /etsyShippingProfileId\)\?\.title\|\|"Etsy shipping profile"\} will be applied/,
    "the raw title is what produced the truncated sentence");
});

/* D414 · The keyword bank is the seller's choice, so Goldie builds from it. It
   used to fall back to the first thirteen phrases alphabetically (a confident
   title from arbitrary phrases), then D403 refused outright on any verified
   mismatch (a feature that mostly says no). Neither: rank the bank by how well
   each phrase matches what is actually on the design, take the closest, and warn
   when the fit looks weak. */
test("D414: a chosen bank always produces a title, ranked by fit", async () => {
  const route = await readFile(new URL("../app/api/listing-intelligence/route.ts", import.meta.url), "utf8");

  const ranking = await readFile(new URL("../app/keyword-ranking.ts", import.meta.url), "utf8");
  assert.match(ranking, /export function bestFitFromBank/);
  /* D429 · Ties now prefer the more specific phrase before falling back to bank
     order, and absolute hits replaced the fraction that let a vague one-word
     match outrank a phrase matching several times. */
  assert.match(ranking, /scored\.sort\(\(a,b\)=>b\.score-a\.score\|\|a\.parts-b\.parts\|\|a\.index-b\.index\)/,
    "ranked by fit, then specificity, ties keeping bank order so the result is stable");
  assert.match(route, /const picked=selected\.length\?selected:bestFitFromBank/);

  /* Refusal is reserved for an empty bank. */
  assert.match(route, /if\(!picked\.length\)return NextResponse\.json\(\{error:"This keyword bank is empty/);
  assert.doesNotMatch(route, /bankFit==="mismatch"\)return NextResponse/,
    "a weak fit is a warning, not a refusal");

  /* And the seller is still told when the bank looks wrong for the design. */
  assert.match(route, /bankFit==="mismatch"\?"This bank may not match this design/);
});

/* D415 · Ranking on the design's visible text alone left art-only designs
   unrankable — Goldie fell back to bank order and said it could not check. The
   vision model is already looking at the picture, so asking it to also name what
   the art depicts costs nothing: same call, same image, a few more words back.
   Rank on what it saw, not only on what it could read. */
test("D415: ranking uses what the model saw, not only readable text", async () => {
  const route = await readFile(new URL("../app/api/listing-intelligence/route.ts", import.meta.url), "utf8");

  assert.match(route, /design_subjects/, "the model is asked what the art depicts");
  assert.match(route, /designSubjects=\(parsed\.design_subjects\|\|\[\]\)/);
  assert.match(route, /const designSignals=\[\.\.\.designText,\.\.\.designSubjects\]/);
  assert.match(route, /bestFitFromBank\(titleCandidates,designSignals,body\.product\)/,
    "and the ranking reads both");

  /* One vision call, as before - this must not become a second request. */
  assert.equal((route.match(/fal\.run\/openrouter\/router\/vision/g) || []).length, 2,
    "one call for titles, one for Etsy details - no extra call for subjects");
});

/* D416 · The Connect screen read "STEP 1 OF 4 · PRODUCT" under a heading saying
   "Connect your accounts", and the rail lit up Product. Connecting Printify and
   Etsy is a one-time gate before the four steps, not the first of them — and it
   offered "Save as draft" with no batch in existence to save. */
test("D416: Connect does not pretend to be step one", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  assert.match(app, /workflowStep==="connect"\?"Account setup · before you start"/,
    "the step count under the title");
  assert.match(app, /workflowStep==="connect"\?"Connect Printify and Etsy"/,
    "and the batch header beside the rail");
  assert.match(app, /workflowStep==="connect"\?"ACCOUNT SETUP":"YOUR BATCH"/);

  assert.match(app, /\{workflowStep!=="connect"&&\(files\.length>0\|\|drafts\.length>0\|\|Boolean\(templateDetails\)\)&&<button className="save-draft-link"/,
    "nothing to save before a batch exists");
});

/* D423 · The rule for lifestyle mockups is not "put it on the chest" — it is
   "put it exactly where Printify put it". The app already sends the Printify
   draft preview as the placement reference (referenceUrl={draft.previewUrl}),
   so the reference branch is the one that actually runs, and it only asked the
   model to "measure the print's relative width, height, center position". D412
   made this worse by writing a chest-print instruction into the fallback, which
   bakes in a t-shirt — and this has to hold for mugs, shower curtains, totes and
   anything else Printify prints. */
test("D423: mockup placement mirrors the Printify template, whatever the product", async () => {
  const renderers = await readFile(new URL("../app/mockups/product-renderers.ts", import.meta.url), "utf8");

  /* Every product kind gets the same rule, not just apparel. */
  assert.equal((renderers.match(/That placement is the specification and it is not yours to improve/g) || []).length, 3,
    "apparel, soft-goods and the curved/irregular branch");
  assert.match(renderers, /Measure both position and size against the product itself/,
    "relative to the product, not the photo frame");

  assert.doesNotMatch(renderers, /front chest/,
    "a chest print is a t-shirt assumption; this runs on mugs too");

  /* And the reference actually reaches the renderer. */
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  assert.match(app, /referenceUrl=\{draft\.previewUrl\}/,
    "the Printify preview is what defines the placement");
});

test("the lifestyle mockup mirrors the Printify template placement, whatever the product", async () => {
  const { artworkPlacement } = await import("../app/placement-math.ts");
  const [integrated, payload, drafts, app] = await Promise.all([
    readFile(new URL("../app/integrated-mockups.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/product-payload.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/drafts/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
  ]);

  // One definition of where the artwork goes. Two would drift, and the drift
  // would be mockups that disagree with the customer's own listing.
  assert.match(payload, /import \{ artworkPlacement \} from/);
  assert.match(drafts, /import \{ artworkPlacement \} from/);
  assert.doesNotMatch(payload, /requestedScale=/, "the math moved to placement-math");

  // A full-bleed design is placed exactly as the template asks.
  const full = artworkPlacement({ x: .5, y: .42, scale: .8, angle: 0 });
  assert.equal(full.scale, .8);
  assert.equal(full.x, .5);
  assert.equal(full.y, .42);

  // Padding is cancelled out: art covering half the canvas width is scaled up
  // to cover the same share of the print area a full-bleed design would.
  const padded = artworkPlacement({ x: .5, y: .5, scale: .4 }, { left: .25, top: .25, right: .75, bottom: .75 });
  assert.equal(padded.scale, .8);
  assert.equal(padded.x, .5, "centred art stays centred");

  // Off-centre art is shifted back to where the template centred it.
  const offset = artworkPlacement({ x: .5, y: .5, scale: .5 }, { left: 0, top: 0, right: .5, bottom: 1 });
  assert.equal(offset.scale, 1);
  assert.equal(Number(offset.x.toFixed(4)), .75);

  // maxPlacementScale still caps it, for products that must not be enlarged.
  assert.equal(artworkPlacement({ scale: .9 }, { left: .1, top: .1, right: .4, bottom: .4 }, 1).scale, 1);

  // The draft records the placement it used, and the mockup consumes it.
  assert.match(drafts, /const draft = \{ id: created\.id, placement,/);
  assert.match(app, /placement=\{draft\.placement\}/);
  assert.match(integrated, /placement\?:ResolvedPlacement/);

  // rigid() gets the padded design on purpose: Printify's scale is measured
  // against the padded canvas, so trimming there too would enlarge art twice.
  assert.match(integrated, /rigid\(design,template,placementAdjustment/);

  // Measured on the live site: in the Printify preview the artwork is ~27% of
  // the shirt width; rendering at the template's own scale of 1 gave ~60%.
  // A template's calibrated corners are NOT the print area, so a Printify scale
  // cannot be applied here directly. Until each template records that ratio, the
  // empirical constants stand - they are what actually matches the preview.
  const real = artworkPlacement({ x: .5, y: .5, scale: 1 }, { left: .16796875, top: .013671875, right: .83203125, bottom: .986328125 });
  assert.equal(Number(real.scale.toFixed(3)), 1.506, "Printify's own math is unchanged and still drives the draft");
  assert.match(integrated, /return\{scale:kind==="rigid-flat"\?1:\.42,x:0,y:0\}/,
    "mockup scale stays empirical until the quad-to-print-area ratio is recorded");
  assert.match(integrated, /calibrated corners are not/,
    "the reason must stay next to the constants so this is not 'fixed' again");
});

test("the Images page has one Next step, and a preview large enough to read", async () => {
  const [app, clarity] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8"),
  ]);

  // One forward control on this page. The second copy looked identical and
  // skipped the every-listing-has-a-photo check.
  assert.doesNotMatch(app, /mockup-next/, "the duplicate forward button is gone");
  assert.equal((app.match(/Continue to titles/g) || []).length, 0,
    "the bottom button says Next step, like every other step");

  // Whatever advances from Images must run the photo check, not just navigate.
  const forward = app.slice(app.indexOf('disabled={imagesStepIssues().length>0}'));
  assert.match(forward.slice(0, 900), /createdListingsMissingImages\(\)/, "the one Next step still gates on photos");
  assert.match(forward.slice(0, 900), /setFinishPhase\("details"\)/, "Images goes to Listing, never straight to Publish");
  assert.match(forward.slice(0, 900), /Next step </);

  /* Every step keeps its forward control on the section it completes and leaves
     Back / Saved automatically / Save as draft in the footer. Images must match
     that, or it becomes the one page where the bottom button is not Next. */
  const imagesFooter = app.slice(app.indexOf("post-draft-footer"), app.indexOf("post-draft-footer") + 700);
  assert.doesNotMatch(imagesFooter, /workflow-next/, "the footer is Back and Save as draft, as everywhere else");
  assert.match(imagesFooter, /workflow-back/);
  assert.match(imagesFooter, /save-draft-link/,
    "Images was the only step you could not stop and save from");

  // The preview has to be big enough that the artwork is legible. At 152px the
  // design came out around 28px wide.
  assert.match(clarity, /minmax\(280px,38%\)/);
  assert.match(clarity, /max-width:400px!important/);
  assert.doesNotMatch(clarity, /\.post-draft-workspace \.draft-card-top\{grid-template-columns:152px/);
});

test("a batch that no longer exists says so instead of silently resetting", async () => {
  const [app, css] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8"),
  ]);
  // Hit while testing: opening a stale ?batch= landed on step 1 with no message,
  // which is indistinguishable from losing your work.
  assert.match(app, /setRestoreNotice\(/);
  assert.match(app, /could not be opened/);
  assert.match(app, /clean\.searchParams\.delete\("batch"\)/,
    "the dead id is cleared so a refresh does not repeat the same dead end");
  assert.match(app, /batch-restore-notice/);
  assert.match(css, /\.batch-restore-notice\{/);
  assert.doesNotMatch(css, /\.batch-restore-notice\{[\s\S]{0,200}#c62828/, "muted, not alarm red");
});

test("a bank phrase that is not in the artwork does not reach the listing — D429", async () => {
  const route = await readFile(new URL("../app/api/listing-intelligence/route.ts", import.meta.url), "utf8");
  const { bestFitFromBank } = await import("../app/keyword-ranking.ts");

  /* Measured on the live site. Her design is a sailboat on stormy waves with the
     words SALTWATER & SOVEREIGNTY and Matthew 8:27. Goldie tagged it "Manatee
     Gifts, Manatee Watercolor, Lobster Shirt, Octopus Shirt, Orca" - none of
     which are in the artwork - because every phrase scored zero, ties fell back
     to bank order, and the list was padded to thirteen regardless. */
  const bank = ["Linocut Shirt","Ecology Shirt","Manatee Gifts","Manatee Watercolor","Lobster Shirt",
                "Octopus Shirt","Orca Shirt","Sailboat Shirt","Nautical Shirt","Ocean Waves Tee"];
  const design = ["saltwater","sovereignty","matthew","sailboat on stormy ocean waves","nautical engraving"];
  const picked = bestFitFromBank(bank, design);

  assert.ok(picked.includes("Sailboat Shirt"), "what is actually depicted ranks first");
  assert.ok(picked.includes("Nautical Shirt"));
  for (const wrong of ["Manatee Gifts","Manatee Watercolor","Lobster Shirt","Octopus Shirt","Orca Shirt"]) {
    assert.ok(!picked.includes(wrong), `${wrong} is not in this artwork`);
  }
  assert.ok(picked.length < 13, "fewer accurate phrases beat a padded thirteen");

  // Related words count: "sailboat" in the design must reach "sailing"/"boat".
  assert.ok(bestFitFromBank(["Sailing Tee","Manatee Gifts","Boat Shirt","Orca Shirt","Lobster Shirt"],
    ["a sailboat"]).includes("Sailing Tee"));

  /* Her real Oceancore bank against her real sailboat design: the bank is
     manatees, lobsters, octopuses and sharks, so nothing matches and no ranking
     can rescue it. Three closest phrases, not thirteen alphabetical ones - the
     seller chose the bank deliberately, so being handed nothing is not an answer,
     but a confident wall of wrong keywords is worse than a short list. */
  const realBank = ["cape cod sweatshirt","ecology shirt","hammerhead shark","hawaii sweatshirt",
    "linocut shirt","lobster shirt","manatee","manatee gifts","manatee sweatshirt","manatee watercolor",
    "meet me at the beach","nantucket","octopus hoodie","octopus shirt","orca shirt","orcas shirt",
    "oyster print","oyster wall art","respect the locals","sardine shirt","sardines","shark week","whale shark"];
  assert.equal(bestFitFromBank(realBank, ["SALTWATER","SOVEREIGNTY","sailboat on stormy ocean waves"]).length, 3);

  // And a design the same bank does describe still gets the right phrases.
  const octopus = bestFitFromBank(realBank, ["giant octopus linocut print","ocean"]);
  assert.ok(octopus.includes("octopus shirt") && octopus.includes("linocut shirt"));
  assert.ok(!octopus.includes("manatee"), "still nothing that is not in the artwork");

  // And the model is told the same rule, so it does not pad either.
  assert.match(route, /Never pad the list to reach a count/);
  assert.match(route, /is not actually shown in the artwork, do not select it/);
});

test("every step's footer is the same three things — D430/D432", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Checked on the live site across all four steps: the forward control belongs
     to the section it completes, and the footer is always Back / Saved
     automatically / Save as draft. Images drifted from this twice in one day -
     first carrying a second forward button, then carrying the only one and
     losing Save as draft - so the shape is asserted rather than remembered. */
  const footers = [...app.matchAll(/workflow-footer-actions[^"]*"/g)].map(match => {
    const segment = app.slice(match.index, match.index + 900);
    const end = segment.indexOf("</div>}");
    return end > 0 ? segment.slice(0, end) : segment;
  });

  assert.ok(footers.length >= 2, "both footer variants are present");
  for (const footer of footers) {
    assert.match(footer, /workflow-back/, "every footer can go back");
    assert.match(footer, /autosave-note/, "and says the work is saved");
    assert.match(footer, /save-draft-link/, "and can stop and save a draft");
    assert.doesNotMatch(footer, /workflow-next/,
      "the forward control lives on the section it completes, never in the footer");
  }
});

test("mockup placement is derived from the Printify preview, for any product — D433", async () => {
  const { derivedPlacement } = await import("../app/mockups/reference-placement.ts");
  const [integrated, placement] = await Promise.all([
    readFile(new URL("../app/integrated-mockups.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/mockups/reference-placement.ts", import.meta.url), "utf8"),
  ]);

  /* Every mockup template is saved with a hardcoded box covering the middle 70%
     of the PHOTO - not the product, not the print area - and the renderer warped
     the artwork onto it at a fixed 42%. That constant was tuned until one set of
     tee photos looked right, which is why it could not hold across products. */
  assert.match(placement, /\[\[\.15,\.12\]/, "the default box is named as the fault it is");

  /* All measured live on her Gildan Tee: the Printify preview puts the artwork at
     14.5% of the garment width, centred, 41.6% down. Segmentation returns the
     garment in the lifestyle photo as centre-x, centre-y, width, height. */
  const fit = { widthRatio: 0.145, centreX: 0.5, centreY: 0.416 };
  const box = { centreX: 0.4977, centreY: 0.6127, width: 0.6182, height: 0.6115 };
  const bounds = { left: 0.16796875, top: 0.013671875, right: 0.83203125, bottom: 0.986328125 };
  const derived = derivedPlacement(fit, box, bounds);
  assert.ok(derived, "her measured numbers must produce a placement");

  // The whole point: the artwork ends up the same fraction of the product it is
  // in the customer's own Printify listing.
  const artOfPhoto = derived.adjustment.scale * (bounds.right - bounds.left) * box.width;
  assert.equal(Number((artOfPhoto / box.width).toFixed(3)), 0.145);
  assert.equal(Number(derived.adjustment.x.toFixed(3)), 0, "centred artwork stays centred");
  assert.equal(Number(derived.adjustment.y.toFixed(3)), -0.084, "and sits where the preview puts it");
  assert.deepEqual(derived.quad[0].map(v => Number(v.toFixed(3))), [0.189, 0.307]);

  // A design whose artwork fills its canvas needs no padding compensation.
  const full = derivedPlacement(fit, box, { left: 0, top: 0, right: 1, bottom: 1 });
  assert.equal(Number(full.adjustment.scale.toFixed(3)), 0.145);

  /* A measurement can be wrong in ways the arithmetic cannot see: a Printify
     preview that is a model shot rather than a flat lay, or segmentation
     returning the person instead of the product. Those hand back nothing so the
     caller falls back, rather than confidently rendering something absurd. */
  assert.equal(derivedPlacement({ widthRatio: 0.001, centreX: .5, centreY: .5 }, box, bounds), null,
    "artwork that would be invisible is not a measurement worth trusting");
  assert.equal(derivedPlacement({ widthRatio: 1.1, centreX: .5, centreY: .5 }, { ...box, width: 0.02, height: 0.5 }, bounds), null,
    "a product box that thin is not the product");
  assert.equal(derivedPlacement(fit, { centreX: 0.5, centreY: 0.5, width: 1.4, height: 0.6 }, bounds), null,
    "a box wider than the photo is a bad segmentation");
  assert.ok(derivedPlacement(fit, box, bounds), "and the real measurement still passes");

  /* D445 · Hit live: half her scenes failed with "does not have a dependable
     calibrated product area" because the garment reaches the photo edge and the
     renderer refuses corners outside the image. Clamping the quad alone would
     silently move the artwork, since the placement is measured against the whole
     product - so the placement is re-expressed against the clamped quad. */
  const cropped = derivedPlacement(fit, { centreX: 0.5, centreY: 0.75, width: 0.9, height: 0.9 }, bounds);
  assert.ok(cropped, "a garment cropped by the frame still renders");
  for (const [cx, cy] of cropped.quad) {
    assert.ok(cx >= 0 && cx <= 1 && cy >= 0 && cy <= 1, "every corner sits inside the photo");
  }
  const quadWidth = cropped.quad[1][0] - cropped.quad[0][0];
  const artInPhoto = cropped.adjustment.scale * (bounds.right - bounds.left) * quadWidth;
  assert.equal(Number(artInPhoto.toFixed(4)), Number((fit.widthRatio * 0.9).toFixed(4)),
    "and the artwork is the same size on the product as it would have been");
  const centreInPhoto = (cropped.quad[0][0] + cropped.quad[1][0]) / 2 + cropped.adjustment.x * quadWidth;
  assert.equal(Number(centreInPhoto.toFixed(3)), 0.5, "and in the same place");

  /* Nothing in the derivation KNOWS what the product is. Checked against the code
     with comments stripped - the prose names products while explaining the
     history, which is the opposite of hard-coding one. */
  const code = placement.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
  assert.doesNotMatch(code, /t-shirt|chest|sleeve|garment|apparel|mug/i,
    "this runs on mugs and shower curtains too");

  // The old constants survive only as the fallback when a measurement is missing.
  assert.match(integrated, /const fit=reference\?await measureReference\(reference,previewFace\):null/);
  assert.match(integrated, /return derived\?rigid\(design,template,derived\.adjustment,derived\.quad\)/);
  assert.match(integrated, /productBoxes=useRef\(new Map<string,ProductBox\|null>\(\)\)/,
    "segmentation runs once per scene, not once per mockup");
});

test("the design cache is bounded, never throws, and says when files are missing — D435", async () => {
  const [cache, app] = await Promise.all([
    readFile(new URL("../app/batch-cache.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
  ]);

  /* Measured on her machine: eighteen cached batches, 68MB, and nothing ever
     prunes. A customer running twenty-design batches adds about 40MB each time. */
  assert.match(cache, /const KEEP_RECENT=12/);
  assert.match(cache, /async function pruneOldest/);
  assert.match(cache, /savedAt:Date\.now\(\)/, "pruning needs to know which are recent");
  assert.match(cache, /if\(Array\.isArray\(value\)\)return \{files:value as File\[\],savedAt:0\}/,
    "entries written before this carried a bare array");

  /* saveBatchFiles was awaited at three call sites with no catch, so a full disk
     would have surfaced as autosave, save-as-draft and batch creation all
     breaking at once. A batch that cannot be cached still works. */
  assert.match(cache, /export async function saveBatchFiles\(batchId:string,files:File\[\]\):Promise<boolean>/);
  assert.match(cache, /\}catch\{\s*return false;/);
  assert.match(cache, /await pruneOldest\(database,Math\.floor\(KEEP_RECENT\/3\)\);\s*await put/,
    "a quota failure makes room and retries rather than losing the save she is watching");

  // And reopening a batch whose files are elsewhere explains itself.
  assert.match(app, /const designsLost=/);
  assert.match(app, /design files are not on this computer/);
  assert.match(app, /Printify drafts are untouched/);
});

test("creating drafts stays on Images, and the final check says what is wrong — D438/D439/D440", async () => {
  const [app, route] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/listing-intelligence/route.ts", import.meta.url), "utf8"),
  ]);

  /* D440 · Creating the drafts jumped straight to Listing details, which is why
     she kept arriving at step 3 having never seen step 2 — the photos and mockups
     appear on the Images page the moment the drafts exist. */
  const afterCreate = app.slice(app.indexOf("const createdNow="), app.indexOf("const createdNow=") + 900);
  assert.doesNotMatch(afterCreate, /goToStep\("finish"/,
    "creating drafts must not leave the Images page");
  assert.match(afterCreate, /document\.querySelector\("\.draft-card"\)\?\.scrollIntoView/,
    "it scrolls to the listings whose photos are now available");

  /* D438 · A short title is a warning, not a failure. It used to build the title,
     throw it away and return a paragraph explaining why the field was empty. */
  assert.doesNotMatch(route, /of 140 title characters for this design/);
  assert.match(route, /const titleIsShort=/);
  assert.match(route, /Short title \\u2014 few phrases in this bank match this design\./);
  assert.match(route, /return NextResponse\.json\(\{title,keywords:included/,
    "the title is returned even when it is short");

  /* D439 · One list, one class, so every alert can sort to the top together. */
  assert.doesNotMatch(app, /"ready":"needs-review"/, "one state vocabulary, not two");
  assert.doesNotMatch(app, /final-safety-readiness/, "the separate readiness grid is gone");
  assert.match(app, /under 100 characters/, "say what is wrong, not that it needs review");
  assert.doesNotMatch(app, /need another try stay here/,
    "nothing reaches Publish that cannot publish");
});

test("every failure is recorded against a person, and Brittany is emailed — D441", async () => {
  const [log, client, admin, layout] = await Promise.all([
    readFile(new URL("../app/error-log.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/client-errors/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/mastermind-admin/admin-control.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  /* Before this there were three unrelated things: printify_diagnostics, which
     recorded draft creation properly; /api/client-errors, which console.error'd
     into logs nobody can query with nobody identified; and everywhere else, which
     recorded nothing. A customer could fail to publish and leave no trace. */
  assert.match(log, /CREATE TABLE IF NOT EXISTS error_log/,
    "created on first write, so it does not depend on a migration being run");
  for (const column of ["user_email", "user_name", "created_at", "area", "message", "error_code", "http_status", "url", "user_agent", "context"]) {
    assert.match(log, new RegExp(`\\b${column}\\b`), `the log records ${column}`);
  }

  // Logging must never become its own outage.
  assert.match(log, /export async function logError[\s\S]{0,1400}\}\s*catch\s*\{\s*return null;/);
  assert.match(log, /catch \{ \/\* An alert that cannot send must not turn one failure into two\. \*\/ \}/);

  // Tokens must not be written into a log that gets emailed around.
  assert.match(log, /export function scrubSecrets/);
  assert.match(log, /Bearer\\s\+\[\\w\.\\-\]\+/);

  // One email per area per 15 minutes: an inbox nobody can face is no alerting.
  assert.match(log, /const ALERT_WINDOW_MINUTES = 15/);
  assert.match(log, /alerted = 1 AND created_at > datetime\('now', \?\)/);

  // Browser crashes now carry identity, read server-side rather than trusted.
  assert.match(client, /const user = await getChatGPTUser\(\)\.catch\(\(\) => null\)/);
  assert.match(client, /area: `browser\/\$\{safe\.kind\}`/);
  assert.match(layout, /url:String\(location\.pathname\+location\.search\)/, "and the page it happened on");

  // And the unpredicted throw is caught by wrapping, not by remembering.
  assert.match(log, /export function withErrorLog/);
  for (const route of ["listing-intelligence", "mockups/render", "printify/drafts"]) {
    const source = await readFile(new URL(`../app/api/${route}/route.ts`, import.meta.url), "utf8");
    assert.match(source, /withErrorLog\("/, `${route} reports its failures`);
  }

  // She can read it without asking anyone, including whether the alert sent -
  // otherwise the only way to know alerting works is to watch an inbox.
  assert.match(admin, /Everything that failed/);
  assert.match(admin, /\{item\.alerted \? "Emailed · " : ""\}/);
  assert.match(admin, /Not signed in/, "an error before sign-in is still worth seeing");
});

test("leaving Images needs photos, not titles — D444", async () => {
  const { leavingImagesIssues } = await import("../app/workflow-gates.ts");
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Walked the real flow for the first time - upload, create drafts - and hit
     this: the Images forward button was checking the PUBLISH gate, index 8.
     Those checks are cumulative, so it demanded titles, tags, description and
     Etsy details, all of which happen on the pages AFTER Images. Nobody hit it
     while creating drafts jumped straight past Images; the moment that stopped,
     it became a deadlock. */
  const ready = {
    connected: true, etsyConnected: true, productSelected: true, templateReady: true,
    shippingReady: true, variantsReady: true, bundleProductsReady: true, colorsReady: true, sizesReady: true,
    pricesReady: true, designCount: 1, designsReady: true, etsyShippingProfileReady: true, bundleProductsReady: true,
    pricingApproved: true, draftsComplete: true, createdDraftCount: 1,
    titlesReady: false, tagsReady: false, descriptionReady: false,
    etsyDetailsReady: false, personalizationReady: false, imagesReady: true,
  };
  assert.deepEqual(leavingImagesIssues(ready), [],
    "a listing with a photo can leave Images before its title exists");
  assert.deepEqual(leavingImagesIssues({ ...ready, imagesReady: false }),
    ["Add at least one photo to every listing."],
    "and cannot leave without one");
  assert.deepEqual(leavingImagesIssues({ ...ready, createdDraftCount: 0 }),
    ["Create at least one Printify draft."]);

  assert.match(app, /function imagesStepIssues\(\)\{return localPreview\?\[\]:leavingImagesIssues\(gateState\(\)\)\}/);
  assert.doesNotMatch(app, /progressGateIssues\(8\)/,
    "the Images page must not be gated on the Publish requirements");
});

test("a failed scene names itself, and the rest are not silently lost — D446", async () => {
  const integrated = await readFile(new URL("../app/integrated-mockups.tsx", import.meta.url), "utf8");

  /* Walked the real flow: four of eight scenes failed, and because staging is
     all-or-nothing the four that worked were discarded too - which is why the
     Rearrange listing photos list had no mockups in it. The all-or-nothing rule
     stands, so a listing never ends up half replaced, but the message said only
     that "every selected scene" had not finished. The way out was to guess which
     scene and deselect it. */
  assert.match(integrated, /const lost=chosen\.filter\(\(_,index\)=>!completed\.has\(index\)\)\.map\(template=>template\.name\)/);
  assert.match(integrated, /Goldie could not finish \$\{lost\.length===1\?"this scene":"these scenes"\}/);
  assert.doesNotMatch(integrated, /could not finish every selected scene/);

  // Staging still only happens when the whole set succeeded.
  assert.match(integrated, /await stageForEtsy\(made\)/);
});

test("a mockup cannot fail to render, for any product — D447", async () => {
  const integrated = await readFile(new URL("../app/integrated-mockups.tsx", import.meta.url), "utf8");

  /* Her requirement, and the right one: mockups must never fail. I had been
     improving the measurement, which only moves the failure - a Printify preview
     that is a model shot, segmentation returning the person, a garment cropped by
     the frame, an API that is down. What makes failure impossible is a render
     path with no way to throw. */

  // 1. The quad chain. The last candidate is valid by construction.
  assert.match(integrated, /function usableQuad\(/);
  assert.match(integrated, /function defaultQuad\(w:number,h:number\)/);
  assert.match(integrated, /const raw=candidates\.find\(q=>usableQuad\([\s\S]{0,80}\)\)\?\?defaultQuad\(canvas\.width,canvas\.height\)/);

  // 2. A highlight layer that will not load is a flatter mockup, not a failed one.
  assert.match(integrated, /catch\{\/\* A highlight layer that will not load is a slightly flatter mockup/);

  // 3. Every surface ends in the compositor, which needs no network at all.
  assert.match(integrated, /return drawLocally\(\);/);
  assert.doesNotMatch(integrated, /await product\(design,template,reference\)/);

  // 4. A missing Printify preview no longer refuses the whole run.
  assert.doesNotMatch(integrated, /Wait for the Printify preview before creating/);

  /* The only throw left in a scene is the one that protects the listing: the
     save. Everything upstream of it degrades. */
  const scene = integrated.slice(integrated.indexOf("async function rigid"), integrated.indexOf("async function stageForEtsy"));
  assert.doesNotMatch(scene, /does not have a dependable calibrated product area/,
    "an unusable area falls through the chain instead of refusing");
});

test("the uploaded photo is never redrawn, and the print is shaded onto it — D448", async () => {
  const integrated = await readFile(new URL("../app/integrated-mockups.tsx", import.meta.url), "utf8");

  /* Reported: the AI came back with her photo looking like a painting, a garment
     it had invented over the model, and the design somewhere other than where
     Printify puts it. A generative editor repaints the whole frame - no prompt
     fixes that, because repainting is what it does. */
  assert.doesNotMatch(integrated, /await product\(design,template,reference\)/,
    "nothing that redraws her scene may place a design on it");

  // The photograph is drawn once and never touched again; ink goes on its own layer.
  assert.match(integrated, /ctx\.drawImage\(master,0,0\);/);
  assert.match(integrated, /const inkCanvas=document\.createElement\("canvas"\)/);
  assert.match(integrated, /tri\(inkCtx,art as unknown as HTMLImageElement/,
    "the artwork is warped into the ink layer, not onto the photo");
  assert.match(integrated, /printOntoGarment\(ctx,inkCtx,canvas\.width,canvas\.height\);\s*ctx\.drawImage\(inkCanvas,0,0\)/);

  /* What makes it read as printed rather than pasted: the cloth's own luminance
     shades the ink, and the ink bends along the folds it sits on. */
  assert.match(integrated, /function printOntoGarment\(/);
  assert.match(integrated, /const average=Math\.max\(\.08,total\/counted\)/,
    "a mid-tone leaves the ink unchanged; folds darken it");
  assert.match(integrated, /const shade=Math\.min\(SHADE_CEILING,Math\.max\(SHADE_FLOOR,luminance\(i\)\/average\)\)/);
  assert.match(integrated, /const FOLD_STRENGTH=6/);

  // The flat 12% wash over the whole frame it replaced.
  assert.doesNotMatch(integrated, /globalCompositeOperation="multiply";ctx\.globalAlpha=\.12/);
});

test("staged listing photos keep their names — D449", async () => {
  const route = await readFile(new URL("../app/api/etsy/images/route.ts", import.meta.url), "utf8");

  /* Seen live in Rearrange listing photos: eight mockups listed as raw UUIDs
     while the Printify photo read "Printify photo 1". The name was being stored
     correctly - R2 simply omits customMetadata from list() unless asked for it,
     so every mockup fell back to its storage key. */
  for (const call of route.match(/ARTWORK\.list\(\{[^)]*\}\)/g) || []) {
    assert.match(call, /include:\["customMetadata"\]/,
      `${call} must ask for the metadata it then reads`);
  }
  assert.match(route, /name:object\.customMetadata\?\.name\|\|object\.key\.split\("\/"\)\.pop\(\)/);
});

test("a keyword bank rejects what cannot be a keyword — D450", async () => {
  const { phrasesFromErank } = await import("../app/seo-utils.ts");

  /* Both found by pasting one realistic, messy list into the real form. */
  const pasted = [
    "sailboat shirt",
    "  Nautical Shirt  ",
    "sailboat shirt",
    "",
    "coastal christian tee,",
    "SAILBOAT SHIRT",
    "a phrase that is far too long to be a sensible etsy tag because it just keeps going well past any reasonable limit",
  ].join("\n");

  assert.deepEqual(phrasesFromErank(pasted),
    ["sailboat shirt", "Nautical Shirt", "coastal christian tee", "SAILBOAT SHIRT"],
    "the exact repeat and the over-long line go; the case variant is hers to keep");

  /* D453 · Duplicates are exact matches only. A plural is not a duplicate of its
     singular and a deliberate misspelling is not a duplicate of the correct
     spelling - those are separate keywords with their own eRank data, and
     collapsing them throws away research she paid for. */
  assert.deepEqual(phrasesFromErank("sailboat shirt\nsailboat shirts"), ["sailboat shirt", "sailboat shirts"]);
  assert.deepEqual(phrasesFromErank("bachelorette tee\nbachlorette tee"), ["bachelorette tee", "bachlorette tee"]);
  assert.deepEqual(phrasesFromErank("Sailboat Shirt\nsailboat shirt"), ["Sailboat Shirt", "sailboat shirt"],
    "case is hers to keep; the Etsy collision is handled where tags are sent");

  // A phrase longer than a title can hold is not a keyword; a real one is kept.
  assert.deepEqual(phrasesFromErank("bikinis and martinis bachelorette"), ["bikinis and martinis bachelorette"]);
  assert.deepEqual(phrasesFromErank("x".repeat(61)), []);
  assert.deepEqual(phrasesFromErank("x".repeat(60)), ["x".repeat(60)]);

  // Still strips trailing separators and blank lines, as before.
  assert.deepEqual(phrasesFromErank("one,\n\n  two  \n"), ["one", "two"]);
});

test("a bundle gate checks every product, not the open one — D451", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Found by running the bundle flow. Her ZZ TEST BUNDLE showed "Pick a shipping
     profile" on two of its three products, each with a warning badge - and Next
     step was enabled anyway, because the gate read the single active product's
     values. Continuing would have created Printify drafts for two products with
     no valid Etsy shipping profile. */
  const gate = app.slice(app.indexOf("function gateState()"), app.indexOf("function gateState()") + 2600);

  assert.match(gate, /etsyShippingProfileReady:activeBundle\?bundleRecipes\.length>0&&bundleRecipes\.every\(recipe=>Number\(recipe\.etsyShippingProfileId\)>0\)/,
    "every product in the bundle needs a shipping profile");
  assert.match(gate, /pricingApproved:activeBundle\?bundleRecipes\.length>0&&bundleRecipes\.every\(/,
    "and every product's pricing has to be approved");

  // The single-product path is unchanged.
  assert.match(gate, /:Boolean\(etsyShippingProfileId\)/);
  assert.doesNotMatch(gate, /etsyShippingProfileReady:Boolean\(etsyShippingProfileId\),pricingApproved,/,
    "the old single-value gate is gone");
});

test("two tags differing only by case never reach Etsy — D453", async () => {
  const route = await readFile(new URL("../app/api/listing-intelligence/route.ts", import.meta.url), "utf8");

  /* A bank may legitimately hold "sailboat shirt" and "SAILBOAT SHIRT", because
     exact duplicates are removed and case variants are not. Etsy refuses two tags
     that differ only by case, so the collision is resolved on the way out rather
     than by editing what she typed. */
  assert.match(route, /const withoutCaseCollisions=\(list:string\[\]\)=>/);
  assert.match(route, /const pickedTags=withoutCaseCollisions\(/);
});

test("every confirmation uses the app's own dialog — D452", async () => {
  const files = ["app/listing-factory-app.tsx","app/factory-tools.tsx","app/keywords/page.tsx","app/batches/page.tsx"];
  const sources = await Promise.all(files.map(f => readFile(new URL(`../${f}`, import.meta.url), "utf8")));
  const dialog = await readFile(new URL("../app/confirm-dialog.tsx", import.meta.url), "utf8");
  const clarity = await readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8");

  /* Destructive actions - deleting a bank, removing a batch, clearing a design -
     used the browser's own confirm(), while everything else used a styled modal.
     The moments that throw work away were the ones that looked least like Goldie.
     A native confirm also blocks the page while open; one froze a test session. */
  for (const [index, source] of sources.entries()) {
    assert.doesNotMatch(source, /window\.confirm\(/, `${files[index]} still calls window.confirm`);
  }

  // It is the same modal shell the rest of the app already uses.
  assert.match(dialog, /className="publish-confirm-backdrop"/);
  assert.match(dialog, /className="publish-confirm confirm-action-modal"/);
  assert.match(dialog, /role="alertdialog"/);

  // Escape and the backdrop both mean no, and refusing is the default answer.
  assert.match(dialog, /event\.key === "Escape"/);
  assert.match(dialog, /if \(!announce\) return Promise\.resolve\(false\)/,
    "with no dialog mounted, a destructive action must not proceed");
  assert.match(dialog, /autoFocus/, "focus lands on Cancel, not the destructive action");

  // Destructive confirmations use the muted rose, never an alarm red.
  assert.match(clarity, /\.confirm-action-go\.destructive\{\s*background:#a32c4c;/);
  assert.doesNotMatch(clarity, /\.confirm-action-go\.destructive\{[^}]*#c62828/);

  // And the host is mounted once, so confirmAction always has somewhere to render.
  assert.match(sources[0], /<ConfirmHost \/>/);
});

test("a curved product wraps the print instead of pasting it flat — D454", async () => {
  const integrated = await readFile(new URL("../app/integrated-mockups.tsx", import.meta.url), "utf8");

  /* A mug is a cylinder. A flat paste on a cylinder reads as a sticker however
     well it is shaded, because print wrapped round a curve compresses towards
     the edges as the surface turns away from the camera. */
  assert.match(integrated, /const CURVE_HALF_ANGLE:Partial<Record<SurfaceKind,number>>=\{curved:\.62,"rigid-flat":0\}/);
  assert.match(integrated, /Math\.asin\(projected\)\/\(2\*angle\)\+\.5/,
    "the inverse of a cylinder's projection, not an eyeballed curve");

  // The destination stays evenly spaced; the artwork is sampled unevenly.
  assert.match(integrated, /su=across\(u\),sU=across\(U\)/);
  assert.match(integrated, /const COLUMNS=\(t\.surfaceKind==="curved"\)\?28:12/,
    "a curve needs more columns than a flat panel to stay smooth");

  // Verified against the maths itself rather than trusting the source text.
  const angle = 0.62, span = Math.sin(angle);
  const across = (u) => Math.asin(Math.max(-1, Math.min(1, (u * 2 - 1) * span))) / (2 * angle) + 0.5;
  assert.equal(Number(across(0).toFixed(6)), 0);
  assert.equal(Number(across(0.5).toFixed(6)), 0.5);
  assert.equal(Number(across(1).toFixed(6)), 1, "symmetric, and the print still fills the surface");
  const edge = across(1 / 12) - across(0), centre = across(7 / 12) - across(6 / 12);
  assert.ok(edge > centre, "an edge column must consume more artwork than a centre one");

  // A flat surface is untouched, so a tee renders exactly as before.
  assert.match(integrated, /if\(!angle\)return \(u:number\)=>u;/);
});

test("every product in a bundle must be finished, not the open one — D455", async () => {
  const { navigationIssues } = await import("../app/workflow-gates.ts");
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* D451 fixed the shipping profile and the pricing approval by hand. The checks
     sitting either side of them - colours, sizes, variants, prices - had exactly
     the same blind spot: they read whichever product is currently open, which in
     a bundle is whichever card is selected. Rather than patch each one, the gate
     asks the bundle cards' own readiness, so what the interface shows and what
     the gate enforces cannot disagree. */
  const ready = {
    connected: true, etsyConnected: true, productSelected: true, templateReady: true,
    shippingReady: true, variantsReady: true, bundleProductsReady: true, colorsReady: true,
    sizesReady: true, pricesReady: true, designCount: 1, designsReady: true,
    etsyShippingProfileReady: true, pricingApproved: true, draftsComplete: true,
    createdDraftCount: 1, titlesReady: true, tagsReady: true, descriptionReady: true,
    etsyDetailsReady: true, personalizationReady: true, imagesReady: true,
  };
  assert.deepEqual(navigationIssues(2, ready), []);
  assert.deepEqual(navigationIssues(2, { ...ready, bundleProductsReady: false }),
    ["Finish every product in this bundle."]);

  // A single product is unaffected: with no bundle active this is always true.
  assert.match(app, /if\(!activeBundle\)return true;/);
  // And it is the same readiness the cards display, not a second opinion.
  assert.match(app, /return readinessFor\(product,recipe,isActive\?pricingApproved:Boolean\(bundleApproved\[recipe\.id\]\)\)\.established/);
});

test("no path sends a design to an image generator — D456", async () => {
  const files = ["app/integrated-mockups.tsx","app/mockups/page.tsx"];
  const sources = await Promise.all(files.map(f => readFile(new URL(`../${f}`, import.meta.url), "utf8")));

  /* An image editor repaints the whole frame - that is what it does, and no
     prompt changes it. So her photograph came back looking like a painting, with
     a product invented over the model and the design somewhere other than where
     Printify puts it. D448 removed it from the Listing Factory and missed the
     Mockup Library, which left the identical fault one screen away. */
  for (const [index, source] of sources.entries()) {
    assert.doesNotMatch(source, /api\/mockups\/render/, `${files[index]} still calls the generative renderer`);
  }
  assert.doesNotMatch(sources[0], /async function product\(file:File/, "the generative path is gone, not just unused");
});

test("a product saves its own defaults, and the shipping notice tells the truth — D457/D458/D459", async () => {
  const [app, clarity] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8"),
  ]);

  /* D457 · Setting a product up ended with a "Save these as X's defaults" button,
     and until it was pressed the recipe held nothing. Readiness reads the saved
     recipe rather than the live selection, so on a new product she could pick a
     shipping profile and still be told to pick a shipping profile, with the batch
     refusing to continue. */
  assert.doesNotMatch(app, /save-initial-product-setup/, "the button is gone");
  assert.doesNotMatch(app, /product-setup-framing first-product-setup/, "and its banner");
  assert.match(app, /const savedDefaultsRef=useRef\(""\)/);
  assert.match(app, /setupComplete:true,\s*defaultColorIds:selectedColorIds/,
    "the first setup is the default, and every later change is the new default");
  assert.match(app, /\.\.\.\(etsyShippingProfileId\?\{etsyShippingProfileId\}:\{\}\)/,
    "including the shipping profile that was the thing blocking her");

  /* D460 · A mug has no colours to choose. Requiring a colour selection before
     saving meant a product with no colour options could never finish setting
     itself up - the same wall, one product type along. Readiness already treats
     "no colour choices" as settled; this now matches it. */
  assert.match(app, /const coloursSettled=!templateDetails\.colorOptions\?\.length\|\|selectedColorIds\.length>0/);
  assert.match(app, /if\(!coloursSettled\)return;/);

  /* D458 · The notice claimed a saved profile had been deleted from her shop, on
     a product she had just created that never had one, and told her to choose
     another "below" while sitting below the picker. */
  assert.doesNotMatch(app, /no longer on your Etsy shop/);
  assert.match(app, /Goldie could not match this product’s Printify shipping to a profile on your Etsy shop\. Pick one above/);
  assert.match(app, /!selectedProfile&&selectedProfileId>0&&!profilesLoading/,
    "and it stays quiet while the profiles are still loading");

  /* D459 · Asked for more than once: approved belongs on the right of the card.
     margin-left:auto moves nothing on an inline-flex box inside a block parent. */
  assert.match(clarity, /\.app-shell \.pricing-approved-state\{[\s\S]{0,200}display:flex!important;\s*width:fit-content!important/);
});

test("a product with no colour axis can still leave step 1 — D461/D462", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Read off her live page rather than guessed at. The mug card showed Ready with
     Colors, Sizes, Pricing and Shipping all ticked, and Next step was disabled
     with no reason given. The button required a colour selection - and a ceramic
     mug has no colours - so it could never enable, whatever she picked. */
  assert.match(app, /function productStepBlocker\(\)\{/);
  assert.match(app, /templateDetails\?\.colorOptions\?\.length&&!selectedColorIds\.length/,
    "colours are required only when the product offers them");
  assert.doesNotMatch(app, /disabled=\{!complete&&\(!selectedColorIds\.length/,
    "the unconditional colour requirement is gone");

  // A disabled forward control must always say what it is waiting for.
  assert.match(app, /disabled=\{!complete&&Boolean\(productStepBlocker\(\)\)\} title=\{productStepBlocker\(\)\|\|undefined\}/);

  /* D461 · Picking a shipping profile un-approved the pricing, and the button to
     approve it again sits inside the collapsed Shipping section - so choosing a
     profile disabled Next with no visible reason and no visible way out. */
  assert.doesNotMatch(app, /setEtsyShippingProfileId\(value\);setPricingApproved\(false\)/);
  assert.match(app, /const carries=recipeCarriesApprovedPricing\(\{defaultProfitTarget:recipe\.defaultProfitTarget,etsyShippingProfileId:value\}\)/);
  assert.match(app, /setEtsyShippingProfileId\(value\);setPricingApproved\(carries\)/);
});

test("a saved product default cannot be overwritten by an older copy — D463", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Reproduced on her live page. She picked a shipping profile and approved it;
     the Shipping row stayed red saying "Pick a shipping profile · 93 profiles on
     your shop" while the server had the profile saved correctly, and a reload
     showed "✓ Shipping · Mug 11oz". The row reads the recipe held in the page,
     and both writers merged their change into a copy captured BEFORE their
     request, then wrote that whole object back afterwards - so a write landing
     late replaced a newer value with its own stale base. */
  assert.doesNotMatch(app, /const updated=\{\.\.\.activeRecipe,\.\.\.change\}/,
    "saveProductDefaults must not write back a pre-request snapshot");
  assert.match(app, /setActiveRecipe\(current=>current&&current\.id===recipeId\?\{\.\.\.current,\.\.\.change\}:current\)/);
  assert.match(app, /setActiveRecipe\(current=>current&&current\.id===recipe\.id\?\{\.\.\.current,\.\.\.change\}:current\)/);

  // Bundle copies of the same recipe move with it, or the card behind it goes stale instead.
  assert.match(app, /setBundleRecipes\(current=>current\.map\(item=>item\.id===recipeId\?\{\.\.\.item,\.\.\.change\}:item\)\)/);
});

test("saving a product cannot overwrite the seller's Etsy shipping choice — D464", async () => {
  const tools = await readFile(new URL("../app/factory-tools.tsx", import.meta.url), "utf8");

  /* Measured on her mug, twice. The recipe held 86599059553 - "Mug 11oz", a real
     profile among her 93 - and later held 313830627087, which is a Printify
     shipping TEMPLATE id and matches none of them. So the Shipping row read
     "Pick a shipping profile · 93 profiles on your shop" and would not clear,
     because the saved value could never match anything.

     The overwrite comes from the product save: it reads the existing choice from
     this component's own copy of the recipe, which is whatever its list held when
     it last loaded. A profile chosen anywhere else since is not in that copy, so
     the guard sees no saved choice and writes the template default over it. */
  assert.match(tools, /const current=editingId\?await fetch\("\/api\/product-recipes"\)/,
    "the recipe is re-read so the guard sees the current choice");
  assert.match(tools, /const savedChoice=Number\(current\?\.etsyShippingProfileId\|\|existing\?\.etsyShippingProfileId\)\|\|0/);
  // The guard itself is unchanged: a template default only fills an empty choice.
  assert.match(tools, /if\(!savedChoice\)shippingProfileId=Number\(verified\.shippingTemplateId\)\|\|shippingProfileId/);
});

test("a hand-marked print area beats an automatic guess — D466", async () => {
  const { isCalibratedQuad, PLACEHOLDER_QUAD } = await import("../app/mockups/calibration.ts");
  const [integrated, page] = await Promise.all([
    readFile(new URL("../app/integrated-mockups.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/mockups/page.tsx", import.meta.url), "utf8"),
  ]);

  /* The mug is what proved this. A bounding box cannot say where a mug's print
     goes: the printable face is offset from the handle and foreshortened by the
     camera. Every professional mockup tool stores a placement marked once per
     photo rather than detecting one per render, and Goldie has always had the
     calibrator to do it - four clicks, saved to the template. */
  assert.equal(isCalibratedQuad(PLACEHOLDER_QUAD, true), false, "the placeholder is not a calibration");
  assert.equal(isCalibratedQuad([[.2, .3], [.7, .3], [.7, .8], [.2, .8]], true), true);
  assert.equal(isCalibratedQuad(undefined, true), false);
  assert.equal(isCalibratedQuad([[120, 200], [400, 200], [400, 500], [120, 500]], false), true,
    "pixel corners were set deliberately");

  /* D433 had the priority backwards: the derived box came first, so an automatic
     guess overrode a human's answer. */
  assert.match(integrated, /const marked=isCalibrated\(t\)\?toPixels\(t\.corners,Boolean\(t\.normalized\)\):null;/);
  assert.match(integrated, /const candidates=\[marked,quadOverride/,
    "marked first, derived second, placeholder last");

  /* And the calibrator was hidden on curved surfaces, so a mug could never be
     calibrated at all - it was only offered for the kinds that used to composite. */
  assert.doesNotMatch(page, /item\.custom&&isCalibratedSurface\(item\.surfaceKind\|\|"rigid-flat"\)&&<button className="resetArea"/,
    "every surface can be calibrated now, because every surface composites");
  /* D468 · The seller is never asked to mark anything - a set holds up to fifty
     photographs. Every scene works out its own print area when it is uploaded;
     the manual control stays only as an adjustment for the rare bad one. */
  assert.match(page, /void findPrintAreas\(added,theme\)/);
  assert.doesNotMatch(page, /Set the product area/, "nothing demands marking");
});

test("a mockup scene works out its own print area — D468", async () => {
  const route = await readFile(new URL("../app/api/mockups/print-area/route.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/mockups/page.tsx", import.meta.url), "utf8");

  /* A set holds up to fifty photographs. Asking the seller to mark four corners
     on each is eight minutes of clicking per set, so marking cannot be the
     requirement - the scene has to answer this itself, once, at upload. */
  assert.match(page, /void findPrintAreas\(added,theme\)/, "every uploaded scene is prepared");
  assert.match(page, /method:"PATCH"[\s\S]{0,120}JSON\.stringify\(\{corners\}\)/, "and the answer is stored on the template");

  /* Segmentation finds the product; the product is not the print area. On a mug
     the printable face is offset from the handle and foreshortened, so what is
     asked for is the quadrilateral in perspective, not a box. */
  assert.match(route, /IN PERSPECTIVE/);
  assert.match(route, /never the handle, and never the whole mug/);
  assert.match(route, /top-left, top-right, bottom-right, bottom-left/);

  /* A wrong quad is worse than none: it would misplace every future design
     silently. Each way it can be wrong is refused by name. */
  for (const reason of ["no-area", "outside-image", "too-small", "whole-image"]) {
    assert.match(route, new RegExp(`reason: "${reason}"`), `${reason} is refused`);
  }
  assert.match(route, /corners: null/, "a refusal returns nothing rather than a guess");

  // One scene failing must not stop the rest of an upload preparing.
  assert.match(page, /catch\{\/\* One scene that cannot be read falls back/);
});

test("the design matches the Printify placement, measured in the same frame — D469/D470", async () => {
  const integrated = await readFile(new URL("../app/integrated-mockups.tsx", import.meta.url), "utf8");
  const placement = await readFile(new URL("../app/mockups/reference-placement.ts", import.meta.url), "utf8");

  /* The whole point of a mockup: it has to show the design where and at what size
     the Printify template puts it. Not merely on the product.
     
     D469 tried to do that with Printify's placement number applied to the scene's
     printable face, and on her mug that came out three times too small. Printify's
     print area for a mug is the entire wrap around the cylinder, not the face you
     can see, so 53% of the wrap is most of the visible face. A flat product hides
     the difference, because a t-shirt's print area IS its front panel. */
  assert.doesNotMatch(integrated, /return rigid\(design,template,\{scale:placement\.scale,x:placement\.x-\.5/,
    "a wrap-relative number cannot be applied to a face-sized area");

  /* Instead both sides are measured in the same frame: the design as a fraction of
     the printable FACE in the Printify preview, reproduced as the same fraction of
     the printable face in the lifestyle photo. Position comes across the same way,
     so the design sits where Printify puts it. */
  assert.match(integrated, /const fit=reference\?await measureReference\(reference,previewFace\):null/);
  assert.match(integrated, /api\/mockups\/print-area[\s\S]{0,400}previewFace=\{left:Math\.min/);
  assert.match(placement, /export async function measureReference\(reference: Blob, face\?:/);
  assert.match(placement, /\/\/ The printable face, as found on the preview\. This is the frame\./);

  // And a preview with no detectable face still measures against the product.
  assert.match(placement, /\} else \{/);
  assert.match(integrated, /catch\{\/\* No face on the preview just means the whole product is the frame\. \*\/\}/);
});

test("the design covers the same share of the face as Printify shows — D471", async () => {
  const { placementInFace } = await import("../app/mockups/reference-placement.ts");
  const integrated = await readFile(new URL("../app/integrated-mockups.tsx", import.meta.url), "utf8");

  /* Measured off her real mug draft: in the Printify preview the design covers
     99.7% of the mug's printable face, dead centre. The mockup rendered it at
     roughly a third of that.
     
     The measurement was right; the pairing was not. The size was worked out
     against the whole mug as segmentation found it, then drawn into the much
     smaller calibrated face. Whichever rectangle the artwork is drawn into has to
     be the one its size was measured against. */
  const fit = { widthRatio: 0.997, centreX: 0.499, centreY: 0.499 };
  const bounds = { left: 0.138671875, top: 0.01171875, right: 0.8828125, bottom: 1 };
  const placed = placementInFace(fit, bounds);
  const artOfCanvas = bounds.right - bounds.left;
  assert.equal(Number((placed.scale * artOfCanvas).toFixed(3)), 0.997,
    "the design covers the same share of the face Printify shows");
  assert.ok(Math.abs(placed.x) < 0.02 && Math.abs(placed.y) < 0.02, "and sits centred, as Printify has it");

  // A calibrated scene takes this path instead of deriving against the product box.
  assert.match(integrated, /if\(fit&&isCalibrated\(template\)\)\{[\s\S]{0,160}placementInFace\(fit,artworkBounds\)/);

  // An absurd result is refused rather than rendered.
  assert.equal(placementInFace({ widthRatio: 9, centreX: .5, centreY: .5 }, bounds), null);
});

test("choosing a saved product keeps its pricing approval — D472", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Reproduced on a clean batch, first attempt, with a product carrying a $12
     profit target and a valid Etsy shipping profile: all four rows showed green,
     Next step was enabled, and pressing it refused with "Approve the item prices
     and shipping on the product step."
     
     Choosing a saved product loads its Printify template, and that load cleared
     the approval unconditionally - so every batch began un-approved regardless of
     what the product had saved. The control to approve again lives inside the
     collapsed Shipping section, so there was nothing on screen to press. */
  assert.doesNotMatch(app, /variant\.templatePrice\]\)\)\);setPricingApproved\(false\)/,
    "loading a template must not throw away a saved approval");
  assert.match(app, /setPricingApproved\(recipeCarriesApprovedPricing\(\{defaultProfitTarget:activeRecipe\?\.defaultProfitTarget,etsyShippingProfileId:activeRecipe\?\.etsyShippingProfileId\}\)\)/,
    "a product with saved pricing stays approved; one without still has to approve once");
});

test("publishing says what is happening, and Etsy gets what it requires — D473/D474", async () => {
  const [finish, app] = await Promise.all([
    readFile(new URL("../app/api/etsy/finish.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
  ]);

  /* D473 · Caught on a real publish of two listings: both refused with Etsy's
     "Missing input parameter: [values]". Etsy requires `values` on a property
     update even when `value_ids` is supplied, and we sent one or the other - so
     any listing with a matched attribute could not publish. */
  /* D477 supersedes the original shape: both parameters always travel together,
     through one helper, because Etsy refuses a request missing either one. */
  assert.match(finish, /body\.append\("value_ids",String\(valueId\)\);body\.append\("values",text\.trim\(\)\|\|String\(valueId\)\)/);
  assert.doesNotMatch(finish, /else body\.append\("values",value\)/, "values alone is refused by Etsy");
  assert.doesNotMatch(finish, /else body\.append\("values",property\.value\)/, "values alone is refused by Etsy");

  /* D474 · The page said it was publishing and, directly underneath, that nothing
     would publish. That caption belongs to the Keep as drafts button, which is no
     longer a choice once publishing has started. */
  assert.match(app, /\{!publishing&&<small className="keep-drafts-note">/);

  // And a publish she just started no longer claims to be resuming one.
  assert.match(app, /monitorPublishJob\(jobId:string,resuming=false\)/);
  assert.match(app, /resuming\?"Goldie is safely resuming your queued batch…":"Goldie is publishing your listings…"/);
  assert.match(app, /if\(jobId\)void monitorPublishJob\(jobId,true\)/, "only the reopened case says resuming");
});

test("a failed publish says why, is logged, and can be retried — D475", async () => {
  const [queue, route, app, css] = await Promise.all([
    readFile(new URL("../app/api/printify/drafts/publish/queue.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/drafts/publish/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8"),
  ]);

  /* Publishing is the only step that costs money, and it was the only step with no
     logging at all. A real batch failed twice and there was nothing anywhere -
     not the error log, not the page - to say why. */
  assert.match(queue, /import \{ logError \} from "@\/app\/error-log"/);
  assert.match(queue, /logError\(\{area:"etsy-publish"/);
  assert.match(queue, /printifyProductId:item\.product_id,attempt,willRetry:retryable/);

  // The reason has to reach the page, not just the database.
  assert.match(queue, /failures=rows\.results\.filter\(row=>row\.status==="failed"\)/);
  assert.match(app, /setPublishFailures\(job\.failures\|\|\[\]\)/);
  assert.match(app, /publishFailures\.length>0&&<section className="publish-failure-panel"/);
  assert.match(css, /\.publish-failure-panel\{/);

  /* D478 - it first went above the checklist, which shoved the whole page down.
     It belongs directly under the buttons, where she is looking when she presses
     publish. */
  const panel = app.indexOf('publish-failure-panel'), buttons = app.indexOf('Keep as Printify drafts for now');
  assert.ok(buttons > 0 && panel > buttons, "the failure panel renders below the publish buttons");

  /* Pressing Publish again could not retry a failed listing: the resumed-job early
     return skipped the re-queue entirely, and attempts was never reset. */
  assert.match(route, /UPDATE etsy_publish_items SET status='queued',attempts=0[^`]*status='failed'/);
  const reset = route.indexOf("AND status='failed'"), existing = route.indexOf("const existing=");
  assert.ok(reset > 0 && reset < existing, "failed items are re-queued before the resumed-job early return");
  assert.match(route, /ELSE 'queued' END,attempts=0/);
});

test("a re-queued listing is never stranded behind a stale job status — D476", async () => {
  const [route, app, ops] = await Promise.all([
    readFile(new URL("../app/api/printify/drafts/publish/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/operations/route.ts", import.meta.url), "utf8"),
  ]);

  /* D475 re-queued failed items but left the job row saying needs_attention.
     needs_attention is terminal, so the queue refused to run and the browser
     stopped polling immediately - publish spun for a second and did nothing,
     with an empty failure panel because the items were no longer failed.
     Three independent places now refuse to let a stale status strand work. */
  assert.match(route, /UPDATE etsy_publish_jobs SET status='processing',failed=0,last_error=NULL[^`]*status IN \('queued','running'\)/);
  assert.match(route, /if\(current\.queued\+current\.processing>0\)await drainGlobalPublishQueue\(\)/,
    "D480 replaced the single-item call here with the parallel drain");
  assert.doesNotMatch(route, /if\(!\["completed","needs_attention"\]\.includes\(current\.status\)\)await processNextGlobalPublishItem/);
  assert.match(app, /while\(!job\|\|!\["completed","needs_attention"\]\.includes\(job\.status\)\|\|job\.queued\+job\.processing>0\)/);

  // And a way to read the real reason without shipping code to find out.
  assert.match(ops, /export async function GET\(\)/);
  assert.match(ops, /FROM etsy_publish_jobs ORDER BY updated_at DESC/);
  assert.match(ops, /SELECT job_id,product_id,status,attempts,last_error/);
});

test("an unmatched attribute is skipped, never fatal — D477", async () => {
  const [finish, css] = await Promise.all([
    readFile(new URL("../app/api/etsy/finish.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8"),
  ]);

  /* Read off her live error log: "Missing input parameter: [value_ids]".
     Etsy's property update requires BOTH value_ids and values. D473 fixed the
     missing `values` and in doing so turned every unmatched attribute into a
     missing `value_ids`, which killed the next two publishes. */
  assert.match(finish, /async function applyProperty\(/);
  assert.match(finish, /if\(!valueId\)\{skipped\.push\(label\);return\}/,
    "a property with no Etsy value id cannot satisfy Etsy and must not be sent");

  // An optional attribute must never cost her a listing.
  assert.match(finish, /try\{await etsyFetch\(`\/shops\/.+\}catch\{skipped\.push\(label\)\}/,
    "a refused property is recorded and stepped over, not thrown");
  assert.equal((finish.match(/properties\/\$\{propertyId\}/g) || []).length, 1,
    "one place builds a property request, so the two parameters cannot drift apart again");

  // D478 - the live status was a full-width slab; it is one line about the button above it.
  assert.match(css, /\.publish-message\{background:none!important/);
});

test("the live build announces itself — D479", async () => {
  const [marker, route] = await Promise.all([
    readFile(new URL("../app/build-marker.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/version/route.ts", import.meta.url), "utf8"),
  ]);
  /* Three separate times a fix was described as live while it was still only on
     GitHub, and the only way to tell was to hunt for a CSS class in the built
     stylesheet. One request now answers it. */
  assert.match(marker, /export const BUILD_MARKER = "D\d+"/);
  assert.match(route, /build:BUILD_MARKER/);
  assert.match(route, /"cache-control":"no-store"/, "a cached answer would defeat the point");
});

test("publishing runs in parallel and stops re-downloading the taxonomy — D480", async () => {
  const [queue, finish] = await Promise.all([
    readFile(new URL("../app/api/printify/drafts/publish/queue.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/etsy/finish.ts", import.meta.url), "utf8"),
  ]);

  /* One listing took about a minute, and the queue drained strictly one at a
     time, so twenty listings meant twenty minutes of holding a tab open. Almost
     all of that minute is idle - waiting on Printify to mint the Etsy listing
     id - so the four slots that already existed now actually run together. */
  assert.match(queue, /await Promise\.all\(Array\.from\(\{length:limit\}/);
  assert.doesNotMatch(queue, /for\(let index=0;index<limit;index\+=1\)/, "the drain was serial");
  assert.match(queue, /processNextGlobalPublishItem\(\)\.catch\(\(\)=>\(\{processed:false\}\)\)/,
    "one listing failing must not abandon the other three");

  // Etsy's entire seller taxonomy was downloaded once per listing.
  assert.match(finish, /let taxonomyCache/);
  assert.match(finish, /if\(taxonomyCache&&Date\.now\(\)-taxonomyCache\.at<TAXONOMY_TTL_MS\)return taxonomyCache\.nodes/);
  assert.equal((finish.match(/"\/seller-taxonomy\/nodes"/g) || []).length, 1,
    "one place fetches the taxonomy, so the cache cannot be bypassed");
});

test("the finish receipt reflects what actually happened — D481", async () => {
  const [ui, app, css] = await Promise.all([
    readFile(new URL("../app/goldie-ui.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8"),
  ]);

  // Fifty designs meant fifty links called "Open Etsy listing 37".
  assert.doesNotMatch(ui, /Open Etsy listing \{index\+1\}/);
  assert.match(ui, /Open your Etsy listings ↗/);
  assert.match(ui, /Open your new Etsy listing ↗/, "a single listing still opens directly");

  // Duplicate this workflow was a third route to what Batch History already does.
  assert.doesNotMatch(ui, /<GoldieButton onClick=\{onDuplicate\}>/);
  assert.doesNotMatch(ui, /onDuplicate/);
  assert.doesNotMatch(app, /onDuplicate=/);

  // The only pure-dark surface in the whole flow, on the celebration screen.
  assert.match(css, /\.receipt-value-strip>div\{background:linear-gradient/);

  // "Ready for final review" has no business sitting above a finished batch.
  assert.match(app, /allCreatedListingsHaveImages\(\)&&!batchReceipt&&/);
});

test("every product in a bundle is reachable from the step she is on — D482/D484", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Step 1 shows every product in the bundle at once and always has. Steps 2, 3
     and 4 did not: the other products sat behind an "Open Gildan Tee" button
     that forced the review step regardless of where she was, so opening the tee
     from step 2 landed on step 3 with no designs and no drafts, and the step
     guard walked her back to the start. She read that as being dumped on step
     one, and she was right. Opening a product now keeps the step she is on. */
  assert.match(app, /url\.searchParams\.set\("step",workflowStep\)/);
  assert.doesNotMatch(app, /url\.searchParams\.set\("step","review"\)/,
    "opening a bundle product must not decide which step she is on");

  // D482 gated the card only because opening it was broken; it works now.
  assert.match(app, /Boolean\(bundleBatchIds\[recipe\.id\]\|\|index===bundleIndex\+1\)/);

  // A card is never left inert with no control and no explanation.
  /* D502 - the waiting message moved onto the disabled Change button, so a card
     is never a bare header with a sentence underneath it. */
  assert.match(app, /title=\{!open&&!reachable\?`Finish \$\{list\[index-1\]\?\.name\|\|"the product above"\} first`:undefined\}/);
});

test("one press creates drafts for every product in a bundle — D485", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Step 1 already collects colours, sizes, prices and shipping for every
     product at once, and then step 2 made her press "Create Printify drafts"
     once per product, walking each one through by hand. */
  assert.match(app, /const \[bundleRun,setBundleRun\]=useState<\{total:number\}\|null>\(null\)/);
  assert.match(app, /if\(activeBundle&&bundleRecipes\.length>1\)setBundleRun\(\{total:bundleRecipes\.length\}\)/,
    "the single confirmation starts the whole run");
  assert.match(app, /Create Printify drafts for all \$\{bundleRecipes\.length\} products/);

  // It advances itself, and stops at the end rather than looping.
  assert.match(app, /if\(bundleIndex\+1>=bundleRecipes\.length\)\{setBundleRun\(null\);return\}/);
  assert.match(app, /void continueBundle\(\)\.finally\(\(\)=>\{bundleAdvancing\.current=false\}\)/);
  assert.match(app, /if\(running\|\|preparingEtsy\|\|preflightOpen\|\|switchingProduct\)return/,
    "it must not start a product while one is mid-flight or awaiting confirmation");

  // A product that is genuinely not set up stops the run instead of spinning.
  assert.match(app, /if\(!ready\|\|!pricingApproved\)return/);

  // She can see which product it is on.
  assert.match(app, /\$\{bundleIndex\+1\} of \$\{bundleRecipes\.length\}/);
});

test("a bundle's shared action sits below its products, not inside one — D486", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Read off her live DOM: the Gildan Hoodie card contained the launch panel and
     the button "Create Printify drafts for all 3 products", with the Gildan Tee
     and crewneck cards below it - a button acting on the whole bundle, nested
     inside one third of what it acts on, above two cards offering to open the
     others one at a time. */
  assert.match(app, /footer:ReactNode=null,showCards=true\)\{\n\s*const sharedAction=Boolean\(footer\)/);
  /* D507 - step 2 lists no products at all now: the designs are uploaded once and
     carried to every product, so there is no per-product state to report there. */
  assert.match(app, /stepProductCards\(bundleCardStatus\("images"\),null,!\(workflowStep==="designs"\),<aside/,
    "the designs step passes its action as a footer");
  assert.match(app, /<\/aside>,false\)\}/, "and asks for no cards");

  // The footer renders after every card, inside the cards section.
  const map = app.indexOf("{footer}"), close = app.indexOf("</section>;", map);
  assert.ok(map > 0 && close > map, "the footer is the last thing in the cards section");

  // With one shared action there is nothing to open a product for.
  /* D498 - the open control became an expand control on every step, so the card
     is the same card whether it is expanded or collapsed. The shared action still
     decides where the step's action lives; it no longer decides whether a closed
     product can be opened at all. */
  assert.match(app, /disabled=\{Boolean\(switchingProduct\)\|\|\(!open&&!reachable\)\}/,
    "D502 - every row carries its own Change, as step 1 does, and says why when it cannot be used");
  /* D502 - that sentence lives on the disabled Change button now. */
  assert.match(app, /title=\{!open&&!reachable\?`Finish /);

  // Rows naming one product read as the whole batch when they sit under three cards.
  assert.match(app, /\{!\(activeBundle&&bundleRecipes\.length>1\)&&<div><span>Saved product<\/span>/);
  assert.match(app, /\{!\(activeBundle&&bundleRecipes\.length>1\)&&<div><span>Product<\/span>/);

  // Reopening a saved bundle left the other cards showing a placeholder glyph.
  assert.match(app, /const missing=bundleRecipes\.filter\(recipe=>recipe\.id!==activeRecipe\?\.id&&!bundleColorProducts\[recipe\.id\]/);
});

test("opening a saved batch never deletes it — D487/D488", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* D488 · DATA LOSS, reproduced live. Her published batch 93db4b27 - the one
     holding her two live Etsy listings - was at the top of Batch History and was
     gone from the database seconds after opening it at step 3.

     clearCurrentBatch deletes the prior batch server-side and defaulted to doing
     so. Its callers only ask permission when files, drafts or a completed run
     are in memory; during a restore none of those are populated yet, so the
     confirmation was skipped and the DELETE fired on the batch being opened. */
  assert.match(app, /function clearCurrentBatch\(clearProduct=true,preserveSavedBatch=true\)/,
    "deleting a saved batch has to be asked for, not defaulted to");
  assert.doesNotMatch(app, /function clearCurrentBatch\(clearProduct=true,preserveSavedBatch=false\)/);

  // A published batch is the only record those listings exist. Nothing deletes it.
  assert.match(app, /const publishedThisBatch=Number\(batchReceipt\?\.publishedCount\)\|\|0/);
  assert.match(app, /if\(priorBatch&&!preserveSavedBatch&&!publishedThisBatch\)\{void clearBatchFiles/);

  /* D487 · Opening a saved batch at ?step=setup landed on "Connect your
     accounts" with both accounts shown as connected, and stayed there: the
     guard falls back to connect while the connection check is still in flight,
     that fallback rewrites the URL to step=connect, and the auto-skip then reads
     the URL to decide whether she asked for the connect screen. */
  assert.match(app, /const requestedStep=useRef<WorkflowStep\|null>\(null\)/);
  assert.match(app, /if\(requestedStep\.current==="connect"\)return/,
    "the auto-skip asks what she requested, not what the fallback wrote");
  assert.doesNotMatch(app, /if\(new URL\(window\.location\.href\)\.searchParams\.get\("step"\)==="connect"\)return/);
  assert.match(app, /if\(!canOpenStep\(wanted\)\)return;\n\s*requestedStep\.current=null;\n\s*goToStep\(wanted,true,true\)/);
});

test("nothing destructive happens on a single click — D489", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Both Disconnect buttons fired immediately, no confirmation - one stray click
     drops the Etsy authorisation or the Printify token and publishing stops
     until she re-authorises. They sit on the connect screen, which D487 proved
     the app parks people on by accident. */
  assert.doesNotMatch(app, /onClick=\{async\(\)=>\{await fetch\("\/api\/etsy",\{method:"DELETE"\}\)/,
    "disconnecting Etsy must be confirmed");
  assert.doesNotMatch(app, /onClick=\{async \(\) => \{ await fetch\("\/api\/printify", \{ method: "DELETE" \} \)/,
    "disconnecting Printify must be confirmed");
  assert.equal((app.match(/title:"Disconnect your Etsy shop\?"/g) || []).length, 2,
    "both Etsy rows confirm");
  assert.match(app, /title:"Disconnect Printify\?"/);

  // Staged Etsy images can belong to listings that are already live.
  assert.match(app, /if\(!preserveSavedBatch&&!publishedThisBatch\)drafts\.forEach/);
});

test("the publish checklist names what is wrong and counts in English — D490", async () => {
  const [app, review] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/final-listing-review.tsx", import.meta.url), "utf8"),
  ]);

  /* Read off her live step 4. Every other line on that checklist counts exactly
     - "1 of 2 titles", "13/13 tags" - and then the photo line said "One or more
     selected listings still need a photo", sending her to find which. The
     function that knows precisely which drafts they are was already there. */
  assert.doesNotMatch(app, /One or more selected listings still need a photo/,
    "the checklist has to name them");
  assert.match(app, /const missing=createdListingsMissingImages\(selectedPublishDrafts\(\)\)/);
  assert.match(app, /still needs a photo/);

  // "1 photos", and "1 of 2 titles are under 100 characters".
  assert.doesNotMatch(review, /\{selectedCount\+mockupCount\} photos/);
  assert.match(review, /===1\?"photo":"photos"/);
  assert.match(app, /===1\?"titles is":"titles are"\} under 100 characters/);
});

test("a reopened batch finishes preparing and the button says why it cannot run — D491", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Reproduced on her live bundle: reopening the batch sat on "preparing 0 of 2
     · Checking dimensions" indefinitely, with no way forward. Design
     measurements are written into the batch snapshot, and a snapshot taken while
     they were still running persists paddingStatus:"checking" - which is what
     autosave does moments after a restore. Measuring only ever happened on
     upload, so nothing re-ran it and the batch could never become usable. */
  assert.match(app, /const remeasured=useRef\(new Set<string>\(\)\)/);
  assert.match(app, /!design\.width\|\|!design\.height\|\|design\.paddingStatus==="checking"/);
  assert.match(app, /void analyzePadding\(unmeasured\)/);
  assert.match(app, /unmeasured\.forEach\(design=>remeasured\.current\.add\(design\.id\)\)/,
    "each design is measured once, or the effect re-runs on its own writes");

  /* And the create button stayed enabled throughout, so clicking it threw a
     blocking modal saying to wait, instead of the button naming the reason. */
  assert.match(app, /: !designsFinished \? `Checking \$\{designsPreparing\}/);
  const ready = app.indexOf("const designsReady="), missing = app.indexOf("const missingRequirement");
  assert.ok(ready > 0 && ready < missing, "designsFinished must be declared before it is read");
});

test("the drafts confirmation describes the run it is confirming — D492", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Caught with the dialog open on her live bundle. The button read "Create
     Printify drafts for all 3 products"; this dialog - the last thing before six
     drafts are made - read "Create 2 product drafts?", listed only "Unisex
     Midweight Softstyle Fleece Hoodie" under a singular "Printify product", and
     charged the plan allowance for 2. */
  assert.match(app, /Create \$\{files\.length\*bundleRecipes\.length\} product drafts across \$\{bundleRecipes\.length\} products\?/);
  assert.match(app, /\{activeBundle&&bundleRecipes\.length>1\?"Printify products":"Printify product"\}/);
  assert.match(app, /`✓ \$\{bundleRecipes\.map\(recipe=>recipe\.name\)\.join\(", "\)\}`/);

  // requestedListingCount already accounts for products and exclusions.
  assert.match(app, /`✓ \$\{requestedListingCount\} of \$\{planDraftsRemaining\} remaining listings`/);
  assert.doesNotMatch(app, /`✓ \$\{files\.length\} of \$\{planDraftsRemaining\} remaining listings`/);
});

test("a bundle run saves each product's work before moving on — D493", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Caught by running a real three-product bundle end to end. Printify held six
     drafts; Goldie's own Batch History showed 2, 0 and 0. The first two
     products' drafts existed only in Printify, with nothing in Goldie pointing
     at them - she would have had to build them again.

     continueBundle reset drafts and minted a new batch id without first writing
     the outgoing batch. Autosave is debounced, so the drafts it had just created
     were cleared from state before they were ever saved. openBundleProduct has
     always flushed before switching; this path never did. */
  const fn = app.slice(app.indexOf("async function continueBundle"));
  const body = fn.slice(0, fn.indexOf("async function createCustomShippingProfile"));
  assert.match(body, /await persistBatchNow\(batchIdRef\.current\);/);
  assert.ok(body.indexOf("persistBatchNow") < body.indexOf("setDrafts([])"),
    "the outgoing batch is written before its drafts are cleared");

  // Mid-run the incoming product has no template yet, so the guard downgraded to
  // setup and rewrote the URL: the page read "Designs + images" at ?step=setup.
  assert.match(body, /requestedStep\.current=workflowStep;/);

  // And the three product cards vanished the moment drafts existed.
  assert.match(app, /,null,!\(workflowStep==="designs"\),<aside/);
  assert.doesNotMatch(app, /,null,!\(workflowStep==="designs"&&!complete\),<aside/);
});

test("named listings stay distinguishable — D494", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* D490 started naming the listings missing photos, and then cut each name at
     32 characters from the front. Seen live: "2 listings still need a photo:
     ChatGPT Image Aug 21, 2026, 05_3, ChatGPT Image Aug 21, 2026, 05_3" - the
     same string twice, which is worse than not naming them at all. Design
     filenames from a camera or an export differ at the end. */
  assert.match(app, /const shorten=\(name:string,limit:number\)=>name\.length<=limit\?name:`\$\{name\.slice\(0,Math\.ceil\(limit\/2\)-1\)\}…\$\{name\.slice\(-Math\.floor\(limit\/2\)\)\}`/);
  assert.doesNotMatch(app, /named\.map\(name=>name\.slice\(0,32\)\)/);

  const shorten = (name, limit) => name.length <= limit ? name : `${name.slice(0, Math.ceil(limit / 2) - 1)}…${name.slice(-Math.floor(limit / 2))}`;
  const a = shorten("ChatGPT Image Aug 21, 2026, 05_32_41 PM (2).png", 40);
  const b = shorten("ChatGPT Image Aug 21, 2026, 05_32_42 PM (4).png", 40);
  assert.notEqual(a, b, "two designs from the same export must not shorten to the same label");
  assert.ok(a.endsWith("(2).png") && b.endsWith("(4).png"));
});

test("one press publishes every product in a bundle — D495", async () => {
  const [app, css] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8"),
  ]);

  /* A bundle published one product at a time: publish the hoodie, go back, open
     the tee, publish again, then the crewneck. Step 2 already creates every
     product's drafts from one press; this is the same run at the other end. */
  assert.match(app, /const \[publishRun,setPublishRun\]=useState<\{total:number\}\|null>\(null\)/);
  assert.match(app, /if\(activeBundle&&bundleRecipes\.length>1\)setPublishRun\(\{total:bundleRecipes\.length\}\)/);
  assert.match(app, /Publish all \$\{bundleRecipes\.length\} products live on Etsy/);

  /* Publishing spends real money, so the run is stricter than the drafts run: a
     product whose listings are not ready stops it, and nothing after publishes. */
  assert.match(app, /const blockers=\[\.\.\.missingPublishFields\(\),\.\.\.createdListingsMissingImages\(chosen\)\.map/);
  assert.match(app, /setPublishRun\(null\);\n\s*stopWith\(`\$\{activeRecipe\?\.name\|\|"This product"\} is not ready to publish\.`/);
  assert.match(app, /if\(publishing\|\|switchingProduct\|\|publishConfirmOpen\|\|restoringBatch\)return/);
  assert.match(app, /if\(bundleIndex\+1>=bundleRecipes\.length\)\{setPublishRun\(null\);return\}/);

  // The last screen before money is spent has to state the real total and fee.
  assert.match(app, /\$\{requestedListingCount\} listings across \$\{bundleRecipes\.length\} products will go live on Etsy\./);
  assert.match(app, /about \$\$\{\(requestedListingCount\*0\.2\)\.toFixed\(2\)\}/);
  assert.match(app, /Goldie publishes \{bundleRecipes\.map\(recipe=>recipe\.name\)\.join\(", "\)\} one after another/);
  assert.match(css, /\.publish-confirm-bundle\{/);

  // And she can see which product it is on.
  assert.match(app, /Publishing \$\{activeRecipe\?\.name\|\|"this product"\} \(\$\{bundleIndex\+1\} of \$\{bundleRecipes\.length\}\)…/);
});

test("two tabs cannot silently overwrite the same batch — D496", async () => {
  const [app, css] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8"),
  ]);

  /* Both tabs autosave the entire batch snapshot every 700ms, so whichever wrote
     last replaced the other tab's work wholesale, with nothing said either way.
     Reproduced live: a batch failed to restore with a second tab open. */
  assert.match(app, /new BroadcastChannel\("goldie-batch-claim"\)/);
  assert.match(app, /const \[batchHeldByAnotherTab,setBatchHeldByAnotherTab\]=useState\(false\)/);

  // The held tab stops writing rather than racing.
  assert.match(app, /if\(!snapshotReady\.current\|\|restoringBatch\|\|batchHeldByAnotherTab\|\|/,
    "autosave is held in the tab that does not hold the batch");

  // A tab only answers a ping while it still holds the batch, so the claim moves.
  assert.match(app, /if\(!batchHeldByAnotherTab\)channel\.postMessage\(\{type:"claim"/);
  assert.match(app, /function takeOverBatchHere\(\)/);

  // And it says so where she is working, instead of silently going quiet.
  assert.match(app, /This batch is open in another Goldie tab\./);
  assert.match(app, /Take over editing here/);
  assert.match(css, /\.batch-tab-conflict\{/);

  // Never crash where BroadcastChannel is unavailable.
  assert.match(app, /if\(typeof BroadcastChannel==="undefined"\)return/);
});

test("step 4's cards drop their open controls now publish covers the bundle — D497", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Publish covered a single product until D495, so these cards kept their own
     "Open Gildan Tee" controls. One press now publishes the whole bundle, and a
     card offering to go open the tee separately contradicts the button beneath
     it - exactly what was wrong on step 2 before D486. */
  assert.match(app, /stepProductCards\(bundleCardStatus\("publish"\),null,false,</);
  assert.doesNotMatch(app, /stepProductCards\(bundleCardStatus\("publish"\),</,
    "the publish step must pass its action as a footer, not as the open card's body");

  // The shared-action switch is what removes those controls.
  assert.match(app, /disabled=\{Boolean\(switchingProduct\)\|\|\(!open&&!reachable\)\}/,
    "D502 - every row carries its own Change, as step 1 does, and says why when it cannot be used");
});

test("every product shows the same rows on every step — D498/D499", async () => {
  const [app, css] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8"),
  ]);

  /* Step 1 shows all three products as the same card, each with its own rows -
     Colors, Sizes, Pricing, Shipping - and a Change on each. Steps 2, 3 and 4
     showed one product's work and left the others as bare headers, so the page
     said nothing about two of the three products she was building. */
  assert.match(app, /function productRows\(recipe:Recipe,isActive:boolean\)/);
  assert.match(app, /const \[bundleBatchSummary,setBundleBatchSummary\]=useState/,
    "the other products' work lives in their own batches and has to be read from them");
  assert.match(app, /\{\(\(\)=>\{const rows=productRows\(recipe,index===bundleIndex\)/,
    "D501 - a single-product batch gets its rows too, as step 1 gives them");
  assert.match(app, /<div className="batch-product-rows">\{rows\.map/);
  assert.match(app, /<span className="row-mark" aria-hidden="true">\{row\.done\?"✓":"!"\}<\/span>/,
    "the same row markup step 1 uses");

  // The active product is read from state, which is fresher than anything saved.
  assert.match(app, /isActive\n?\s*\?\{designs:files\.length/);

  // The bolted-on open control is gone; the rows carry Change, as step 1 does.
  assert.doesNotMatch(app, /className="step-product-open"/);
  assert.doesNotMatch(app, /className="step-product-expand"/);
  assert.doesNotMatch(css, /\.step-product-open\{/);
  assert.doesNotMatch(css, /\.step-product-expand\{/);
});

test("no product on any step falls back to a bare header — D500", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  const fn = app.slice(app.indexOf("function productRows("), app.indexOf("function stepProductCards("));

  /* A product with no batch yet had no summary to read, so productRows returned
     nothing and its card collapsed back to a bare header - the exact thing these
     rows exist to stop. Step 1 never does that: a product that is not set up
     still shows every row, saying it is not set. */
  assert.doesNotMatch(fn, /return \[\];/, "no branch may return an empty row list");
  assert.match(fn, /const counts=mine\|\|\{designs:0,titled:0,tagged:0,drafts:0,described:false,complete:false,published:0,status:"",photos:0,mockups:0\}/);
  assert.match(fn, /const started=Boolean\(mine\)/);

  // All three steps are covered, and each returns rows.
  const returns = fn.match(/return \[/g) || [];
  assert.equal(returns.length, 3, "D517 - step 2 lists products again once the drafts exist");
  for (const label of ["Listing photos", "Mockups", "Listings", "Titles and tags", "Description"]) {
    assert.ok(fn.includes(`label:"${label}"`), `${label} row is built`);
  }

  // An unstarted product says so rather than claiming zero of zero.
  assert.equal((fn.match(/"Not started yet"/g) || []).length, 7, "D517 - step 2 has two rows of its own");
});

test("the bundle cards do not churn the network or the tab claim — D501", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Both of these ran off savedRevision, which ticks on every autosave - once per
     700ms while she types a title. The summary refetched every other product's
     batch on each tick, and the tab claim re-broadcast and cleared its held flag
     on each tick, so a held tab could un-hold itself off a save it never made. */
  assert.match(app, /\},\[activeBundle,bundleRecipes,activeRecipe,bundleBatchIds\]\);/,
    "the summary reloads when the active product changes, not on every save");
  assert.doesNotMatch(app, /\},\[activeBundle,bundleRecipes,activeRecipe,bundleBatchIds,savedRevision\]\);/);
  assert.match(app, /const pingedBatch=useRef\(""\)/);
  assert.match(app, /if\(pingedBatch\.current===id\)return;/,
    "the claim is asked once per batch, not once per save");

  // All three steps go through the one card renderer, so rows cannot drift apart.
  assert.equal((app.match(/stepProductCards\(bundleCardStatus\(/g) || []).length, 4);
  assert.equal((app.match(/const rows=productRows\(recipe,index===bundleIndex\)/g) || []).length, 1,
    "one row block serves every step");
});

test("step 3's rows match step 1's, captured from both live pages — D502", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Read off the two rendered pages side by side rather than the source.
     Step 1: three cards, four rows each, a Change on every row of every card -
     including the product already open.
     Step 3 before this: the open card's rows had no control at all, and the
     product waiting its turn had a "Finish Gildan Tee first" sentence under a
     bare card, which step 1 never shows. */
  assert.match(app, /disabled=\{Boolean\(switchingProduct\)\|\|\(!open&&!reachable\)\}/,
    "the Change exists on every row and disables rather than disappearing");
  assert.match(app, /title=\{!open&&!reachable\?`Finish \$\{list\[index-1\]\?\.name\|\|"the product above"\} first`:undefined\}/,
    "and the waiting reason rides on it");
  /* D503 - the whole row opens, as step 1's does, so the behaviour lives in one
     handler that the row and its button both call. */
  /* D515 - every row scrolled to the same element, so Titles landed on the
     description and Description did nothing visible. Each row goes to its own
     section, and a section that is a <details> opens and closes. */
  assert.match(app, /const openRow=\(target\?:string\)=>\{/);
  assert.match(app, /if\(node instanceof HTMLDetailsElement\)\{node\.open=!node\.open;if\(!node\.open\)return\}/);
  assert.match(app, /onClick=\{event=>\{event\.stopPropagation\(\);openRow\(row\.target\)\}\}/,
    "the button must not fire the row handler twice");

  // The separate waiting paragraph and its styling are gone.
  assert.doesNotMatch(app, /className="step-product-waiting"/);
});

test("the row itself opens, exactly as step 1's does — D503", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Captured from step 1's live DOM:
       <div class="batch-product-row settled  clickable" role="button"
            tabindex="0" aria-expanded="false"> … <button class="row-open">
     Mine were plain divs whose only control was the button, so clicking the row
     did nothing and none of it was reachable by keyboard. */
  assert.match(app, /className=\{`batch-product-row \$\{row\.done\?"settled":""\} \$\{switchingProduct\|\|\(!open&&!reachable\)\?"":"clickable"\}`\}/);
  assert.match(app, /role=\{switchingProduct\|\|\(!open&&!reachable\)\?undefined:"button"\}/);
  assert.match(app, /tabIndex=\{switchingProduct\|\|\(!open&&!reachable\)\?undefined:0\}/);
  assert.match(app, /aria-expanded=\{open\}/);
  assert.match(app, /if\(event\.key==="Enter"\|\|event\.key===" "\)\{event\.preventDefault\(\);openRow\(row\.target\)\}/,
    "keyboard reaches it too, as step 1 does");
  assert.match(app, /<button type="button" className="row-open"/);

  // A row that cannot be used is not announced as a button.
  assert.match(app, /\?undefined:"button"\}/);
});

test("a card's chip and its rows cannot disagree — D504", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* The chip at the top of a product card and the rows underneath it were fed by
     two different maps, filled by two different effects at two different moments
     and keyed differently - one by batch id, one by recipe id. The same card
     could read "2 drafts" in its chip and "Not started yet" in every row. */
  assert.doesNotMatch(app, /const \[bundleBatchSummaries,setBundleBatchSummaries\]/,
    "the second map is gone");
  assert.match(app, /const summary=bundleBatchSummary\[recipe\.id\];/,
    "the chip reads the same map the rows read");
  assert.equal((app.match(/setBundleBatchSummary\(/g) || []).length, 1,
    "one loader fills it");

  // That loader carries what the chip needs as well as what the rows need.
  assert.match(app, /published:Number\(listed\?\.published_count\)\|\|0/);
  assert.match(app, /status:String\(listed\?\.status\|\|""\)/);
});

test("a card that says Ready is not also asking to approve — D505/D506", async () => {
  const [app, batches, clarity, history] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/batches/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8"),
    readFile(new URL("../app/batch-history.css", import.meta.url), "utf8"),
  ]);

  /* D506 · Her words: the first product had the Ready symbol, and there was still
     an approve pricing and shipping button to press on pricing she had never
     touched - and Next stayed blocked. The card's readiness and the approval that
     gates Next were two different things. A saved product carries an approved
     target and profile; reopening a batch restored pricingApproved as false and
     nothing put it back. */
  assert.match(app, /if\(carries&&!pricingApproved&&Number\(etsyShippingProfileId\)===Number\(activeRecipe\.etsyShippingProfileId\)\)setPricingApproved\(true\)/,
    "an untouched saved product is already approved");
  assert.match(app, /if\(recipeCarriesApprovedPricing\(\{defaultProfitTarget:recipe\.defaultProfitTarget,etsyShippingProfileId:recipe\.etsyShippingProfileId\}\)\)seed\[recipe\.id\]=true/,
    "and so is every other product in a restored bundle");

  /* D505 · batch-history-actions styled the selection toolbar, and was also the
     class on the span around every Resume button - so each row wore the
     toolbar's border, padding and white fill. Those were the pale boxes. */
  assert.doesNotMatch(batches, /batch-history-actions/);
  assert.doesNotMatch(clarity, /\.batch-history-actions\{/);
  assert.doesNotMatch(history, /\.batch-history-actions\{/);
  assert.match(batches, /<span className="batch-row-actions">/);
  assert.match(batches, /<div className="batch-history-select">/);
  assert.match(clarity, /\.batch-row-actions\{[^}]*background:none/);
});

test("step 2 lists no products, and a mockup set previews ten — D507/D508", async () => {
  const [app, mockups, mockupCss] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/mockups/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/mockups/mockups.css", import.meta.url), "utf8"),
  ]);

  /* D507 · Step 2 listed every product and reported "Not started yet" designs for
     the two she had not reached. That was never true: designs are uploaded once
     and carried to every product by the bundle run. Worse, Change on one of those
     cards switched products - back to step 1 and forward again, to reach the same
     upload box already on screen. Step 2 shows the designs and the one button. */
  assert.match(app, /footer:ReactNode=null,showCards=true\)/);
  assert.match(app, /\{showCards&&list\.map\(\(recipe,index\)=>\{/);
  assert.match(app, /<\/aside>,false\)\}/, "the designs step asks for no cards");
  assert.doesNotMatch(app, /\{label:"Designs",value:started\?plural/, "and has no row set left");

  /* D508 · An opened mockup set rendered every scene at full size, so a set of
     fifty was a very long scroll before the next set began. */
  assert.match(mockups, /const SET_PREVIEW=10;/);
  assert.match(mockups, /\(expandedSets\.has\(theme\)\?items:items\.slice\(0,SET_PREVIEW\)\)\.map/);
  assert.match(mockups, /Show \$\{items\.length-SET_PREVIEW\} more in this set/);
  assert.match(mockups, /Show fewer/);
  assert.match(mockupCss, /\.thumbs\{grid-template-columns:repeat\(auto-fill,minmax\(112px,1fr\)\)/);
});

test("low resolution shows the table and never blocks — D509/D510/D511", async () => {
  const [app, batches] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/batches/route.ts", import.meta.url), "utf8"),
  ]);

  /* D509 · A flagged design in a bundle got a blocking dialog of sentences - one
     run-on line per design per product, no sizes, no way past it. The resolution
     table already existed for the single-product flow: design, uploaded size,
     what Printify recommends, and Proceed anyway. Bundles never reached it. */
  assert.doesNotMatch(app, /stopWith\("Choose what to do with every design flagged below\."/,
    "low resolution is a judgement for her, not a wall");
  assert.match(app, /if\(undecided\.length\)\{setPixelWarningOpen\(true\);return\}/);
  assert.match(app, /activeBundle&&bundleQualityIssues\.length\n?\s*\?bundleQualityIssues\.map\(issue=>\(\{id:issue\.key/,
    "and the table carries every product a design is undersized for");
  assert.match(app, /if\(undecided\.length\)\{decideAllQuality\("include"\);setPreflightOpen\(true\);return\}/,
    "Proceed anyway is the decision, not a trip back to make it again");

  /* D510 · Three batches of one bundle showed three different names, because
     setup_name is the saved product a batch started from - one member of three. */
  assert.match(batches, /state\.activeBundle&&\(state\.bundleRecipes\|\|\[\]\)\.length>1\?String\(state\.activeBundle\.name\|\|""\)\.trim\(\):""/);

  /* D511 · A batch minted by the bundle run has no drafts yet, so Batch History
     showed a grey placeholder on the screen meant for recognising batches. */
  assert.match(batches, /state\.templateDetails\?\.previewImage\|\|\(state\.templateDetails\?\.previewImages\|\|\[\]\)\.find\(Boolean\)/);
});

test("alerts use the app's alert colour, and JSX text is not escape sequences — D514", async () => {
  const [app, clarity] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8"),
  ]);

  /* Seen on her screen: "so that tab’s work is not overwritten". A \u escape
     is processed inside a string or template literal and printed literally in JSX
     text, and this one was JSX text. */
  assert.doesNotMatch(app, /\\u[0-9a-fA-F]{4}[^`'"]*<\/(span|b|p|small)>/,
    "no \\u escape in JSX text");
  assert.match(app, /so that tab’s work is not overwritten/);

  /* Both panels I added invented a tan instead of using the faded red already in
     .critical-dpi and .publish-live-warning. It is a token now. */
  assert.match(clarity, /--alert-line:#b83c4a;--alert-tint:#fff0f1;--alert-ink:#9e2736/);
  assert.doesNotMatch(clarity.replace(/\/\*[\s\S]*?\*\//g, ""), /#c97a4a|#fdf7f2|#a35f34|#e6c9b4|#eedfd3/,
    "the invented tan is gone from every rule");
  for (const rule of [/\.publish-failure-panel\{[^}]*var\(--alert-tint\)/, /\.batch-tab-conflict\{[^}]*var\(--alert-tint\)/]) {
    assert.match(clarity, rule);
  }
});

test("every step is the same shape: a collapsible card per product — D517", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Her words: every step works the same, each product in a collapsible card,
     open it and that product's work is inside. D507 took the cards off step 2
     because the design upload is shared - and took the mockups with them, so a
     three-product bundle showed only hoodies with no way to reach the other two.
     The upload and its one button stay shared; once the drafts exist, each
     product gets the same card it gets on every other step. */
  assert.equal((app.match(/stepProductCards\(bundleCardStatus\(/g) || []).length, 4,
    "designs upload, designs images, listing, publish");
  assert.match(app, /\{complete && workflowStep==="designs" && stepProductCards\(bundleCardStatus\("images"\)/);
  assert.match(app, /\{label:"Listing photos"[^}]*target:"details\.recommended-listing-photos"\}/);
  assert.match(app, /\{label:"Mockups"[^}]*target:"\.integrated-mockups"\}/);

  // Every target has to be a selector that exists, not one I hoped for.
  const targets = [...app.matchAll(/target:"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(targets)].sort(), [
    ".batch-title-builder", ".final-review", ".integrated-mockups",
    "details.permanent-description", "details.recommended-listing-photos",
  ]);
  for (const target of targets) {
    const bare = target.replace(/^details/, "").replace(/^\./, "");
    assert.ok(app.includes(`className="${bare}"`) || app.includes(`${bare} `) || bare === "integrated-mockups",
      `${target} must match markup that exists`);
  }
});
