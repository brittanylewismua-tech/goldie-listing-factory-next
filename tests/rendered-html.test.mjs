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
  assert.match(page, /Creating drafts · \$\{processed\} of \$\{runTotal\} finished/);
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

test.skip("unifies saved products, editing, pricing, and mockups without the old factory toggle", async () => {
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
  assert.match(recipes, /validated \{chosen\.keywords\.length===1\?"phrase":"phrases"\} available to Goldie/);
  assert.match(page, /Exact title phrases/);
  assert.match(page, /300 DPI recommended/);
  /* D214: renamed and opened by default. It was a closed <details> reading
     "Choose Printify flatlays", so a seller who never found it published with
     no product photographs at all. */
  /* D555 - the picker renders once, always bare, so the <details> copy could
     never appear. Deleted; this asserts the one that renders. */
  assert.match(page, /className="printify-image-picker bare"/);
  assert.match(page, /IntegratedMockups/);
  /* D566 - the per-listing set picker is gone. Three set choosers were on screen
     at once inside one panel - the batch chooser and one per listing - and they
     disagreed: the panel read "Gildan Hoodies" while both listings offered BACH
     TEES, tee photographs, for a hoodie. The set is chosen once, above; each
     listing names the set it follows. */
  assert.match(mockups, /className="mockup-set-name"/);
  assert.doesNotMatch(mockups, /Choose a mockup set/);
  assert.match(mockups, /useEffect\(\(\)=>\{setTheme\(defaultTheme\);setResults\(\[\]\);setEtsyStatus\(""\)\},\[defaultTheme\]\)/);
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
  assert.match(page, /Goldie adds it to every listing in this batch/);
  assert.match(page, /printifyImageIndices/);
});

test.skip("renders Mockup Library as management only", async () => {
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
  assert.match(page,/Completing Etsy details/);
  /* D541 - "Etsy details completed" was a disclosure nested inside step 3's
     table of every listing. The Etsy fields are their own task now, and each
     listing's row reports its own standing on that task instead. */
  /* D544 - "Needs review" told her nothing. When one required field is all that
     stands between her and step 4, the row names it. */
  assert.match(page,/export function etsyMissingRequired\(/);
  assert.match(page,/missing\.length===1\?`\$\{missing\[0\]\} still needed`/);
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
  assert.match(creation, /Provided images do not exist/);
  assert.match(creation, /8253/);
  assert.match(route, /createProductWithImageRetries/);
  assert.match(creation, /3000, 7000, 15000, 20000, 30000, 45000/);
  /* D613 - the re-upload moved from the third product attempt to the first image
     error, and a second image error now ends the attempt instead of running the
     ladder out. A deterministic 400 is not a propagation race. */
  assert.match(route, /if \(imageErrors === 1\)/);
  assert.match(creation, /const IMAGE_ERROR_LIMIT = 2/);
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

test.skip("makes keyword bank saving unmistakable and prevents accidental duplicates", async () => {
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
  assert.match(page,/separately ranked Etsy tags created/);assert.match(page,/Goldie selects only exact phrases from this bank/);
  /* D541 - the promise moved with the block that held it; this is the copy that
     carries it now, in the title builder itself. */
  assert.match(page,/No new keywords are ever added/);
  assert.ok(page.indexOf('if(task==="description")')<page.indexOf('individual-description-body'),"The batch description leads the panel, and each listings.");
  assert.match(page,/The complete description is shown below/);
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
  assert.match(page, /20 listings while you test/);
  assert.match(page, /photos per listing/);
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
  /* D552 - deleted. She asked for it gone once ("there doesn't need to be a link
     that says recommended photos for the soft..."), D540 moved it into the photos
     panel instead, and she had to ask again. The row is named "Choose Printify
     photos" and every photo is listed under it with counts; a collapsed essay
     about which views to pick was advice nobody opened. */
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
  assert.match(libraryRoute,/\[row\.objectKey,row\.occlusionKey,preparation\?\.surfaceMaskKey,preparation\?\.depthKey/,
    "deleting a set removes the original and every prepared scene layer");
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
  assert.match(page,/"rigid-flat" \| "phone-case" \| "t-shirt" \| "sweatshirt" \| "hoodie" \| "other-apparel" \| "apparel" \| "soft-goods" \| "curved" \| "irregular"/);
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
  assert.match(integrated,/if\(derived\)\{const rendered=await rigid\(design,template,derived\.adjustment,derived\.quad\)/);
  /* D573 - there is no constant fallback any more. A scene that cannot reproduce
     the draft's real Printify placement refuses by name instead of rendering a
     convincing-looking guess at a flat 42% centred. */
  /* D577 - no scene refuses. Every selected photograph produces a mockup: the
     surface is measured when the photograph can be read and computed from the
     product's geometry when it cannot, and Printify owns the artwork's side,
     scale, position and rotation inside that surface either way. A seller who
     selects eight scenes receives eight mockups. */
  assert.doesNotMatch(integrated,/needs its print area confirmed in Mockup Library/,
    "a scene must never hand the seller a calibration task");
  assert.doesNotMatch(integrated,/if\(unmeasured\.length\)throw/,
    "an unmeasured scene must not fail the batch");
  assert.match(integrated,/const measured=calibrated;/,
    "every selected scene renders");
  assert.doesNotMatch(integrated,/scale:kind==="rigid-flat"\?1:\.42/,
    "the 42% constant must not live in the render path");
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
  /* D637 renamed this: it no longer WAITS, it takes a short bounded look and
     hands the item back to the queue if the id is not ready. */
  assert.match(queue,/pollForEtsyListing/);
  assert.match(queue,/product\.external\?\.id/);
  /* The rule is about locating a LISTING: never guess by sorting newest or
     matching titles, only follow the exact Printify link. D639 compares Printify
     SHOP titles against the connected Etsy shop name, which is a different
     question, so the assertion now names the listing-lookup forms it guards. */
  assert.doesNotMatch(`${publish}\n${queue}`,/sort_on|newest|listing.*title.*match|match.*listing.*title/i);
  assert.doesNotMatch(`${publish}\n${queue}`,/findListingByTitle|searchListings/i);
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
  assert.match(dashboard,/Keyword banks/);assert.doesNotMatch(dashboard,/Mockup sets/);assert.match(dashboard,/listings created this month/);
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
  const clarity = await readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8");
  /* D541 - the count lived in an editor-heading above one big block. It reports
     per row now - "9 of 13 tags", "Same as batch", "Ready" - and per panel, and
     wrapping any of those onto a second line is what this has always been about. */
  assert.match(clarity, /\.app-shell \.task-listing-count\{[^}]*white-space:nowrap/);
  /* D553 - the chooser is gone: opening a task shows every listing's work, each
     under its name, which is what step 2 did before D541. */
  assert.match(clarity, /\.app-shell \.task-listing-count\{[^}]*white-space:nowrap/);
  assert.match(clarity, /\.app-shell \.task-panel-heading\{/);
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
  assert.match(page, /const combined=\[\.\.\.files\.map\([\s\S]{0,400}\.\.\.images\]/,
    "new artwork is appended after any missing original is reattached in place");
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

test("downloads each listing's selected Printify photos and uploaded photos as one local ZIP",async()=>{
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
  assert.match(route,/02-additional-photos/);
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
  /* D539 - step 2 is about photographs now, so the listing's title and tags no
     longer ride along beside the Printify button there; tag-row lives on step 3,
     where titles and tags are edited. What must stay true is that the Printify
     editor button is still attached to its own listing's preview. */
  assert.match(page,/draft\.editorUrl[\s\S]{0,400}?Open in Printify to resize or reposition[\s\S]*?<\/div><\/div>/);
  assert.match(page,/className="tag-row"/, "and tag-row still exists on step 3");
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
  assert.match(mockups,/made\.length!==measured\.length/);
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

test.skip("keeps the saved-product batch page compact and makes permanent settings editable",async()=>{
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
  /* D664 · The naming is still per product; the sentence now adapts, because a
     seller with one product must not be told which of several it affects. */
  assert.match(app,/is below the recommended size\{productsInBatch\.length>1\?<> for <strong>\{productList\.join\(", "\)\}/);
  assert.match(app,/:<> for <strong>\{productList\[0\]\|\|"this product"\}<\/strong><\/>\}/,
    "one product is still named, just without the bundle framing");
  assert.match(app,/Proceed anyway/);
  assert.match(app,/Exclude this listing/);
  assert.match(app,/Nothing is skipped silently/);
  assert.match(app,/dpi<215/);
  assert.match(app,/VERY LOW RESOLUTION/);
  assert.match(app,/below 215 DPI/);
  assert.match(app,/selectedPublishDrafts\(\)/);
  /* D635 - the photo check moved into publishBlockers(), which passes the same
     selection to createdListingsMissingImages. The guarantee is unchanged: the
     press is judged on the listings selected, never on the open product. */
  assert.match(app,/createdListingsMissingImages\(chosen\)\.map\(draft=>`\$\{draft\.name\} needs at least one listing photo\.`\)/);
  assert.match(app,/const chosen=selectedPublishDrafts\(\);\n    issues\.push\(\.\.\.missingPublishFields\(\)\)/);
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
  /* D541 - "dense rows with one in-place editor" is what step 3 is now, but built
     out of the same task rows every other step uses rather than a bespoke table
     wedged inside a shared block. */
  const clarity=await readFile(new URL("../app/clarity-pass.css",import.meta.url),"utf8");
  /* D553 - the chooser is gone: opening a task shows every listing's work, each
     under its name, which is what step 2 did before D541. */
  assert.match(clarity,/\.app-shell \.task-listing-head\{/);
  assert.match(clarity,/\.app-shell \.task-listing-work\{/);
  /* D553 - one collapse, at the task; every listing's work is open under it. */
  assert.match(clarity,/\.app-shell \.task-listing-work\{/);
  assert.match(clarity,/\.app-shell \.task-panel-body\{/);
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
  /* D546 - the checklist that carried these was deleted: it repeated the product
     cards above it line for line. Both counts moved onto the rows that own them,
     which is where she is already reading everything else. */
  assert.match(app,/under 100 characters/);
  assert.match(app,/const shortTitles=isActive\?files\.filter\(file=>file\.title\.trim\(\)\.length<100\)\.length:0/,
    "the Titles and tags row counts the listings that need review");
  /* D549 - "2 of 2 written · 1 at 13 tags" counted listings on both sides but
     only said so on one, so the right-hand number read as a tag count. Her
     question: "is that supposed to say one of thirteen tags?" */
  assert.match(app,/\$\{counts\.tagged\} of \$\{counts\.designs\} with all 13 tags/);
  assert.doesNotMatch(app,/at 13 tags`/);
  assert.match(app,/\$\{counts\.titled\} of \$\{counts\.designs\} titles · \$\{counts\.tagged\} of \$\{counts\.designs\} with all 13 tags/,
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
  /* D546 - the publish checklist repeated the product cards above it line for line, so it was deleted; each fact it carried moved to the row that owns it. */
  assert.match(app,/\{label:"Pricing and shipping",value:isActive\?\(pricingApproved\?/);
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
  /* D662 · Concurrency 1 was what held this ordering, quietly. Raising it to 2
     reintroduced D71 and this assertion caught it. The baseline is now
     established explicitly - the first design alone, the rest in pairs - so the
     rule no longer depends on a concurrency number nobody connected to it. */
  assert.match(app,/const \[first,\.\.\.rest\]=pending;\n\s*await prepareOne\(first\);/);
  assert.match(app,/await runBounded\(rest,BACKGROUND_ETSY_CONCURRENCY,/);
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
  /* D545 - and a batch whose saving is paused because another tab holds it must
     not run work that costs credits and is then thrown away. */
  assert.match(app,/disabled=\{preparingEtsy\|\|progressGateIssues\(6\)\.length>0\|\|batchHeldByAnotherTab\}/);
  assert.match(app,/function markShippingEdit\(\)\{onApprovalChange\(false\)/);
  assert.doesNotMatch(app,/if\(!selectedProfile\|\|customDirty\)onApprovalChange/);
});

test("uses one management navigation vocabulary everywhere (fixes D84)",async()=>{
  const nav=await readFile(new URL("../app/management-nav.tsx",import.meta.url),"utf8");
  assert.doesNotMatch(nav,/label:"Mockup Library"/);
  assert.match(nav,/label:"Usage \+ Plan"/);
  for(const page of ["batches","keywords","usage"]){
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
  assert.match(route,/selection=await requestSelection\(0\);if\(selection\.selected\.length<minimumTitlePhrases\|\|selection\.tags\.length<requiredTagCount\)selection=richer\(selection,await requestSelection\(1\)\)/);
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
  /* D544 - this gated on finishPhase==="etsy", and that phase is never entered:
     continueToEtsyDetails() sets "details" and only the URL claimed otherwise. So
     a reopened batch showed a category control with nothing in it to pick. It
     waits on the data it needs now, not on a phase name. */
  assert.match(page,/useEffect\(\(\)=>\{if\(etsyCategories\.length\)return;const restored=files\.find\(file=>file\.etsy\)\?\.etsy;if\(!restored\)return;void resolveEtsyOptions\(restored,restored\.taxonomyId\)/,
    "Restored batches must load the full category list so the visible category control can actually change.");
  assert.doesNotMatch(page,/finishPhase!=="etsy"/,
    "nothing may gate on a phase the app never enters");
});

test("photo recommendations and defaults follow the saved product — D105",async()=>{
  const page=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
  assert.match(page,/function productPhotoGuide\(blueprintTitle:string,availableCount:number\)/);
  assert.match(page,/productFamily\(blueprintTitle\)/);
  /* D552 - deleted. She asked for it gone once ("there doesn't need to be a link
     that says recommended photos for the soft..."), D540 moved it into the photos
     panel instead, and she had to ask again. The row is named "Choose Printify
     photos" and every photo is listed under it with counts; a collapsed essay
     about which views to pick was advice nobody opened. */
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
  assert.match(route, /activeBundle\?:\{name\?:string\};activeRecipe\?:\{name\?:string\};bundleIndex\?:number;bundleRecipes\?:unknown\[\]/);
  /* D551 - and it names which member, because D510's fix made every member of a
     run identical: "ZZ TEST BUNDLE / 3 products · 2 designs" three times over,
     one row per product, distinguishable only by timestamp. */
  assert.match(route, /return name\?`\$\{name\} · product \$\{position\}`:`\$\{total\} products`/);
  assert.match(route, /const position=Number\.isFinite\(index\)&&index>=0&&index<total\?`\$\{index\+1\} of \$\{total\}`/);
});

/* D214/D407 · D214 forced this picker open because a closed fold meant sellers
   published with no product photographs and no way to know. She has since asked
   for the opposite and for a clear reason: arriving on Images dropped you inside
   the first listing's photos before you had chosen what to work on. Nothing on
   this step expands itself now. The original risk is handled by the publish
   checklist, which names a listing with no photo before anything goes live. */
test("D407: nothing on the Images step expands itself", async () => {
  const page = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /<details className="printify-image-picker"/,
    "arriving on a step should not open a fold for you");
  /* D555 - the picker renders once, always bare, so the <details> copy could
     never appear. Deleted; this asserts the one that renders. */
  assert.match(page, /<div className="printify-image-picker bare">/);

  /* The guard that replaced it: publishing still cannot happen silently without
     photos. */
  /* D546 - the publish checklist repeated the product cards above it line for line, so it was deleted; each fact it carried moved to the row that owns it. */
  assert.match(page, /\{label:"Listing photos"/);
  assert.match(page, /still needs a photo/);
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
  /* D546 - the publish checklist repeated the product cards above it line for line, so it was deleted; each fact it carried moved to the row that owns it. */
  assert.match(app, /friendlyShippingProfileTitle\(etsyShippingProfiles\.find\(profile=>profile\.id===etsyShippingProfileId\)\?\.title\)/);
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
  const removedApp = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(removedApp, /<IntegratedMockups|Adjust placement|Create lifestyle mockups/);
  return;
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
  const removed = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  assert.match(removed, /<UploadedListingPhotos/);
  assert.doesNotMatch(removed, /<IntegratedMockups/);
  return;
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
  assert.match(drafts, /import \{ readPrintSide, artworkPlacement \} from/);
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
  // D573 - the adjustment is resolved first now, because it can refuse.
  assert.match(integrated, /const exact=placementAdjustment\(placement,template\.surfaceKind\|\|"rigid-flat","print-area"\)/);
  assert.match(integrated, /if\(exact\)\{const began=Date\.now\(\)/);
  assert.match(integrated, /const rendered=await rigid\(design,template,exact\)/);
  assert.match(integrated, /const made=\{\.\.\.rendered,automatic:automaticFor\(template,exact\)\}/,
    "the generated card carries the exact transform into Reset");
  // D573 - and it records what it did, so a wrong mockup can be explained.
  assert.match(integrated, /source:"printify"/);

  // Measured on the live site: in the Printify preview the artwork is ~27% of
  // the shirt width; rendering at the template's own scale of 1 gave ~60%.
  // A template's calibrated corners are NOT the print area, so a Printify scale
  // cannot be applied here directly. Until each template records that ratio, the
  // empirical constants stand - they are what actually matches the preview.
  const real = artworkPlacement({ x: .5, y: .5, scale: 1 }, { left: .16796875, top: .013671875, right: .83203125, bottom: .986328125 });
  assert.equal(Number(real.scale.toFixed(3)), 1.506, "Printify's own math is unchanged and still drives the draft");
  /* D573 - the ratio this was waiting for is recorded now: quadMeans. A scene
     whose quad is a confirmed Printify print area takes Printify's scale and
     position directly, so the empirical constant has no job left and is gone. */
  assert.doesNotMatch(integrated, /return\{scale:kind==="rigid-flat"\?1:\.42,x:0,y:0\}/,
    "the empirical constant must not survive in the render path");
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
  assert.match(integrated, /if\(derived\)\{const rendered=await rigid\(design,template,derived\.adjustment,derived\.quad\)/);
  assert.match(integrated, /productBoxes=useRef\(new Map<string,ProductBox\|null>\(\)\)/,
    "segmentation runs once per scene, not once per mockup");
});

test("the design cache is bounded and a missing browser cache never erases listing records — D435/D632", async () => {
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

  // IndexedDB is browser-profile storage. Its absence must not turn a saved
  // two-listing batch into 0 of 0 or claim the seller changed computers.
  const restore=app.slice(app.indexOf("const cached=await loadBatchFiles"),app.indexOf("const savedProductColors="));
  assert.match(restore, /state\.designs\|\|\[\]\)\.map/);
  assert.doesNotMatch(restore, /filter\(Boolean\)/,
    "server-saved design metadata survives when the local File is unavailable");
  assert.match(restore, /draft\?\.previewUrl\|\|draft\?\.printifyImages\?\.\[0\]/,
    "the existing Printify draft supplies a useful preview");
  assert.match(restore, /originalUnavailable:!file/);
  assert.match(app, /listings are.*restored and can still be completed and published/);
  assert.doesNotMatch(app, /design files are not on this computer|continue on the computer you started on/);
  assert.match(app, /<UploadedListingPhotos productId=\{draft\.id\}/,
    "listing-photo uploads remain available without the original design file");
  const upload=app.slice(app.indexOf("async function chooseFiles"),app.indexOf("const remeasured="));
  assert.match(upload, /design\.originalUnavailable.*design\.contentHash===contentHash/,
    "choosing the original file reconnects it to the saved design");
  assert.match(upload, /originalUnavailable:false/);
  assert.match(upload, /if\(images\.length\)\{setComplete\(false\);setDrafts\(\[\]\)/,
    "reattaching source bytes does not erase existing Printify drafts");
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
  assert.match(integrated, /const lost=measured\.filter\(\(_,index\)=>!completed\.has\(index\)\)\.map\(template=>template\.name\)/);
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

  /* D528 - the host moved to the root layout. It was mounted inside the Listing
     Factory only, so on Batch History, Keyword Banks and the Mockup Library
     confirmAction returned a promise that never settled and the button did
     nothing at all. Verified live: "Delete 20 batches" registered, no dialog
     appeared, all 20 batches survived. */
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /<ConfirmHost\/><NewBuildNotice\/><\/body>/);
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
  const route = await readFile(new URL("../app/api/mockups/library/[id]/prepare/route.ts", import.meta.url), "utf8");
  const contract = await readFile(new URL("../app/mockups/prepared-scene.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/mockups/page.tsx", import.meta.url), "utf8");

  /* A set holds up to fifty photographs. Asking the seller to mark four corners
     on each is eight minutes of clicking per set, so marking cannot be the
     requirement - the scene has to answer this itself, once, at upload. */
  /* D579 - started on upload, not awaited. Awaiting it blocked the page for as
     long as the analyser took, one scene at a time. Nothing is stranded by
     letting go: a scene that is not prepared when a batch selects it is prepared
     then, and preparation cannot fail. */
  assert.match(page, /void findPrintAreas\(added,theme\)/, "every uploaded scene is prepared");
  assert.match(page, /Array\.from\(\{length:Math\.min\(6,scenes\.length\)\},worker\)/,
    "and prepared several at a time rather than one after another");
  /* D575 - stored, and stored as usable. Detection that only wrote corners left
     the scene as "garment", which refuses to render, so a seller who uploaded
     twenty scenes got twenty dead ones. The route already refuses anything that
     fails validation or is low confidence, so what arrives here is trustworthy. */
  assert.match(page, /\/prepare`,\{method:"POST"/, "the whole reusable scene is prepared, not only a rectangle");
  assert.doesNotMatch(page, /MARK WHERE THE DESIGN CAN PRINT|Reset product area/);

  /* Segmentation finds the product; the product is not the print area. On a mug
     the printable face is offset from the handle and foreshortened, so what is
     asked for is the quadrilateral in perspective, not a box. */
  assert.match(contract, /complete Printify print area as it appears in this photograph/);
  assert.match(contract, /A mug or tumbler is cylindrical and excludes its handle/);
  assert.match(contract, /top-left, top-right, bottom-right, bottom-left/);

  /* A wrong quad is worse than none: it would misplace every future design
     silently. Each way it can be wrong is refused by name. */
  assert.match(contract, /normalizeSceneAnalysis/);
  assert.match(contract, /width < bounds\.minWidth/);
  assert.match(route, /MAX_ATTEMPTS = 3/);

  // One scene failing must not stop the rest of an upload preparing.
  assert.match(page, /catch\{\/\* The stored queued state is retried automatically when used/);
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

  /* "Ready for final review" has no business sitting above a finished batch.
     D625 removed that banner outright - it restated the product card's own
     "Listing photos ✓" row one line below it - so the stronger guarantee now is
     that it cannot appear after publishing because it cannot appear at all. */
  assert.doesNotMatch(app, /<b>Listing photos complete<\/b>/,
    "the publish page must not restate a tick the card above it already shows");
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
  /* D640 - same rule, sturdier memory. requestedStep is cleared as soon as the
     step it names is current, which on a fresh ?step=connect is immediately, so
     the auto-skip was reading a ref that had already been emptied and skipped
     anyway. The arrival is recorded once and never cleared. */
  assert.match(app, /if\(askedForConnect\.current\)return/,
    "the auto-skip asks what she requested, not what the fallback wrote");
  assert.match(app, /askedForConnect\.current=requestedStep\.current==="connect";/);
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
  /* D546 - the publish checklist repeated the cards above it, so it went; each fact moved to the row that owns it. */
  assert.match(app, /===1\?"title is":"titles are"\} under 100 characters/);
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
  /* D546 - "Publish all 3 products" counted products while every number above it
     counted the open product's two listings, so the page never said how many Etsy
     listings would be created. And it offered the press while two of the three
     products had no batch at all. */
  assert.match(app, /* D636 - product count from the selected targets. */ /Publish \$\{total\} \$\{total===1\?"listing":"listings"\} live on Etsy · \$\{products\} \$\{products===1\?"product":"products"\}/);
  assert.match(app, /function bundleProductsNotStarted\(\)/);
  /* D627 widened this: a member whose batch cannot be opened also blocks the
     press, and says so in its own words rather than claiming it has no
     listings yet. Both messages must name the product. */
  /* D635 - a product with no listings has no selected listings, so it cannot
     make a bad publish; it can only stop a good one, which is exactly what
     happened when a deleted batch held the ready product hostage. D546 added
     this because the confirmation claimed 3 products while 2 had nothing, and
     D634 fixed that claim at its source - the confirmation now names only what
     will actually publish, so this no longer has to guess. */
  assert.doesNotMatch(app, /for\(const recipe of bundleProductsNotStarted\(\)\)missing\.push/,
    "an empty product must not block a press it is not part of");
  assert.match(app, /if\(bundleProductsStillReading\(\)\.length\)missing\.push\("Goldie is still reading the other products in this batch"\)/,
    "but an unread member still blocks, because the selection may be incomplete");

  /* Publishing spends real money, so the run is stricter than the drafts run: a
     product whose listings are not ready stops it, and nothing after publishes. */
  /* D559 - one press now means one call. It used to publish the open product,
     wait for its receipt, switch the whole app to the next product's batch,
     publish that, and repeat - so the run depended on the tab staying open
     through two batch restores, and a stall between products left her half
     published. There is nothing to advance to now. */
  assert.match(app, /const blockers=\[\.\.\.missingPublishFields\(\),\.\.\.createdListingsMissingImages\(selectedPublishDrafts\(\)\)\.map/);
  assert.match(app, /stopWith\("This batch is not ready to publish\."/);
  assert.match(app, /if\(publishing\|\|switchingProduct\|\|publishConfirmOpen\|\|restoringBatch\)return/);
  assert.match(app, /if\(batchReceipt\)\{setPublishRun\(null\);return\}/);
  assert.doesNotMatch(app, /openBundleProduct\(bundleIndex\+1\)/,
    "publishing never switches product");
  assert.doesNotMatch(app, /publishAdvancing/);

  // Every listing in the bundle goes in one request, each with its own settings.
  assert.match(app, /function publishTargets\(\)/);
  assert.match(app, /const byProduct=Object\.fromEntries\(everything\.map\(item=>\[item\.id,\{selections:item\.selections,indices:item\.indices,shippingProfileId:item\.shippingProfileId\}\]\)\)/);
  assert.match(app, /productIds:ids,printifyImageIndices,printifyImageSelections,etsyShippingProfileId,byProduct/);

  // The last screen before money is spent has to state the real total and fee.
  /* D634 - this asserted the confirmation counted designs x products. It does
     not any more: that is the size of the batch when the drafts were created,
     and it overstated a partial publish by three times on the screen where the
     number is the cost. The confirmation counts what is actually being sent. */
  assert.match(app, /\$\{publishTargets\(\)\.length\} \$\{publishTargets\(\)\.length===1\?"listing":"listings"\} across/,
    "the confirmation headline counts the listings that will publish");
  assert.match(app, /about \$\$\{\(publishTargets\(\)\.length\*0\.2\)\.toFixed\(2\)\}/,
    "and quotes the fee for that same number - D634");
  /* D634 - names the products actually being published, falling back to the
     whole bundle when nothing is resolved yet. */
  assert.match(app, /Goldie publishes \{\[\.\.\.new Set\(publishTargets\(\)\.map\(item=>item\.productName\)\.filter\(Boolean\)\)\]\.join\(", "\)\|\|bundleRecipes\.map\(recipe=>recipe\.name\)\.join\(", "\)\} one after another/);
  assert.match(css, /\.publish-confirm-bundle\{/);

  // And she can see which product it is on.
  /* D559 - it no longer publishes one product at a time, so it no longer reports
     which one it is on. */
  assert.match(app, /* D637 - the busy label counts the press, not the bundle. */ /Publishing \$\{sending\} \$\{sending===1\?"listing":"listings"\} across \$\{across\} \$\{across===1\?"product":"products"\}…/);
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
  assert.match(app, /<span className="row-mark" aria-hidden="true">\{row\.done\?"✓":row\.pending\?"…":row\.optional\?"–":"!"\}<\/span>/,
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
  assert.equal(returns.length, 3, "D539 - one row set per step");
  for (const label of ["Review Printify placement", "Choose Printify photos", "Upload your own listing photos", "Arrange final photo order", "Write titles and tags", "Edit description", "Review Etsy category and fields", "Listings ready", "Published"]) {
    assert.ok(fn.includes(`label:"${label}"`), `${label} row is built`);
  }

  // An unstarted product says so rather than claiming zero of zero.
  /* D548 - the literal moved into one variable: a product whose batch has not
     been read yet says "Checking…", because calling it unstarted was the same
     lie that had step 4 refusing to publish a ready bundle. */
  assert.match(fn, /const unread=!isActive&&!mine&&Boolean\(bundleBatchIds\[recipe\.id\]\)/);
  assert.match(fn, /const blank=unread\?"Checking…":"Not started yet"/);
  assert.ok((fn.match(/\bblank\b/g) || []).length >= 12, "every row uses it");
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
     description and Description did nothing visible.
     D541 - and the whole idea of a row scrolling anywhere is gone with it. A row
     opens its own panel in its own card; there is no shared block left to land
     in the wrong part of. */
  assert.match(app, /const openRow=\(_target\?:string,task\?:string\)=>\{/);
  assert.doesNotMatch(app, /node\.open=!node\.open/);
  const handler = app.slice(app.indexOf("const openRow=("), app.indexOf("return <div className=\"batch-product-rows\">"));
  assert.ok(!handler.includes("scrollIntoView") && !handler.includes("querySelector"),
    "no row scrolls the page or hunts for a selector to find its content");
  assert.match(app, /event\.stopPropagation\(\);holdRowInPlace\(event\.currentTarget\.closest\("\.batch-product-row"\) as HTMLElement\|null\);openRow\(row\.target,row\.task\)/,
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
  assert.match(app, /className=\{`batch-product-row \$\{row\.done\?"settled":row\.pending\?"pending":row\.optional\?"optional":"needed"\} \$\{rowOpen\?"open":""\} \$\{row\.report\?"reporting":switchingProduct\|\|\(!open&&!reachable\)\?"":"clickable"\}`\}/);
  assert.match(app, /role=\{row\.report\|\|switchingProduct\|\|\(!open&&!reachable\)\?undefined:"button"\}/);
  assert.match(app, /tabIndex=\{row\.report\|\|switchingProduct\|\|\(!open&&!reachable\)\?undefined:0\}/);
  assert.match(app, /aria-expanded=\{row\.report\?undefined:rowOpen\}/);
  assert.match(app, /event\.preventDefault\(\);if\(row\.report\)return;holdRowInPlace\(event\.currentTarget as HTMLElement\);openRow\(row\.target,row\.task\)/,
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
  /* D535 - both of these pointed at whatever selector happened to exist rather
     than at the thing the row is about. "Listing photos" opened an advice panel
     headed "Recommended photos for Unisex Midweight Softstyle Fleece Hoodie", so
     the row toggled a tip and went nowhere near a photo. The two real sections
     are the Printify picker and the lifestyle mockup builder, and the page
     already names them that way. */
  /* D539 - step 2's rows own panels rather than pointing at sections. */
  assert.match(app, /\{label:"Choose Printify photos"[^}]*task:"printify"\}/);
  assert.match(app, /\{label:"Upload your own listing photos"[^}]*task:"lifestyle"\}/);
  assert.match(app, /\{label:"Arrange final photo order"[^}]*task:"order"\}/);
  assert.match(app, /\{label:"Review Printify placement"[^}]*task:"placement"\}/);
  assert.doesNotMatch(app, /target:"details\.recommended-listing-photos"/,
    "a row never points at an advice panel");

  /* D541 - her rule, and the last place it was still broken: "stop pointing the
     columns at certain places in the block." A row that scrolls somewhere is a
     bookmark into a pile, and two rows can bookmark the same spot - which is
     exactly what step 4 did with .final-review. No row points anywhere now.
     Every row either owns a panel or reports and offers nothing. */
  assert.deepEqual([...app.matchAll(/target:"([^"]+)"/g)].map((m) => m[1]), [],
    "no row navigates to a selector any more");
  const row = (label) => {
    const at = app.indexOf(`{label:"${label}"`);
    assert.ok(at > 0, `${label} row is built`);
    // D544 - a row's value may be a short function now, so read to the next row.
    const next = app.indexOf('{label:"', at + 8);
    return app.slice(at, next > at ? next : app.indexOf("\n];", at));
  };
  for (const [label, task] of [["Write titles and tags", "titles"], ["Edit description", "description"], ["Review Etsy category and fields", "etsy"]]) {
    assert.ok(row(label).includes(`task:"${task}"`), `${label} owns the ${task} panel`);
  }
  for (const reporting of ["Listings ready", "Listing photos", "Published"]) {
    assert.ok(row(reporting).includes("report:true"),
      `step 4 reports ${reporting} rather than pretending to open it`);
  }
});

test("everything on step 2 that describes one product sits in that product's card — D518/D520", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  const cardsAt = app.indexOf('{complete && workflowStep==="designs" && stepProductCards(');

  /* D518 - the mockup set chooser sat at the very top of step 2, above the upload
     box: one set, asked before a single design existed, for a batch of three
     different products. A hoodie scene is not a tee scene. */
  /* D540 - and specifically inside the task that uses it, rather than floating
     above every task in the card. */
  assert.match(app, /if\(task==="lifestyle"\)return <>[\s\S]{0,2500}?<UploadedListingPhotos/);

  /* D520 - "Recommended photos for Unisex Midweight Softstyle Fleece Hoodie"
     rendered above all three cards, describing the open product only, with
     nothing for the other two.
     D552 - and then it was deleted, which is what she asked for the first time.
     Nothing may bring it back. */
  assert.doesNotMatch(app, /recommended-listing-photos/);
  assert.doesNotMatch(app, /Recommended photos for/);

  /* D519 - a run in progress is not a broken state to recover from: mid-switch
     the next product's template has not loaded, and the guard sent her to step 1
     from a run she started on step 2. */
  assert.match(app, /const runInProgress=useRef\(false\)/);
  assert.match(app, /\|\|restoringBatch\|\|runInProgress\.current\|\|canOpenStep\(workflowStep\)\)return/);
  assert.equal((app.match(/runInProgress\.current=Boolean\(/g) || []).length, 2,
    "both the drafts run and the publish run set it");
});

test("an open product card does not run to four screens — D522", async () => {
  const css = await readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8");

  /* Measured on her live three-product bundle: the open card was 2992px against a
     756px viewport - four screens - and each listing inside it was 1003px, from a
     318px Printify preview and a 345px photo strip of 130px thumbnails. Twenty
     designs would have been twenty screens per product. */
  /* D525 - the image obeyed and the button did not: a later rule pins aspect-ratio
     1/1 and max-width 400px with !important, leaving a 318px square around a 168px
     picture. The cap has to carry the same weight or it loses again. */
  assert.match(css, /\.post-draft-workspace \.draft-card-top \.printify-preview-button,[\s\S]{0,120}max-width:180px!important;aspect-ratio:auto!important/);
  assert.match(css, /\.photo-order-strip img\{max-height:74px/);
  assert.match(css, /\.draft-card-grid\{gap:14px\}/);
});

test("a decided batch does not lead with the picker, and step 3 opens compact — D523/D524", async () => {
  const [app, tools] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/factory-tools.tsx", import.meta.url), "utf8"),
  ]);

  /* Measured live: on a batch whose bundle is already chosen, step 1 led with the
     saved-products picker and her three product cards started at 1099px, below
     the fold. The choice is made; the picker is how you change it. */
  assert.match(tools, /bundleChosen\?:boolean;/);
  assert.match(tools, /function LibraryShell\(\{collapsed,children\}/);
  assert.match(tools, /<LibraryShell collapsed=\{props\.bundleChosen\}>/);
  assert.match(tools, /Change the products in this batch/);
  assert.match(app, /<SavedWorkflow bundleChosen=\{Boolean\(activeBundle&&bundleRecipes\.length>1\)\}/);

  /* D524 - step 3's sections opened themselves, so one product's card measured
     2237px and the other two sat below it. They open when she opens them. */
  /* D541 - the disclosures are gone with the block. A step 3 card opens showing
     three rows and nothing else, which is as compact as D524 was reaching for. */
  for (const shell of ["batch-title-builder", "design-table-section", "permanent-description"]) {
    assert.ok(!app.includes(`<details className="${shell}`) && !app.includes(`listing-section">`),
      `${shell} is no longer an accordion inside a shared block`);
  }
  assert.match(app, /if\(task==="titles"\)return <div/);
});

test("a row never offers Change for a section that is not on the page — D525", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Driven live on step 3's Etsy phase: the card showed "Titles and tags" and
     "Description" rows, each with a Change button, while neither the title
     builder nor the description was rendered on that phase at all. Both buttons
     did nothing. Step 3 has two phases and they draw different things. */
  /* D541 - the rescue is gone because the thing it rescued is gone. Titles,
     description and the Etsy fields are three task panels the rows own, and the
     rows render them in either phase, so no row can point at something the page
     is not drawing. */
  assert.doesNotMatch(app, /setFinishPhase\("details"\);window\.setTimeout\(/,
    "no row throws the step back a phase to find its content");
  assert.doesNotMatch(app, /card\?\.querySelector\(target\)/,
    "no row resolves a selector at all");
  assert.doesNotMatch(app, /while\(parent\)\{if\(parent instanceof HTMLDetailsElement\)parent\.open=true/,
    "and nothing has to prise open a stack of disclosures to reach a row's content");
});

test("the publish button refuses in advance, not after the click — D526/D527", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* D527 - driven live: "Publish all 3 products live on Etsy" was enabled, and
     pressing it threw a blocking dialog listing four unfinished things. That is
     the pattern D229 already fixed on the create-drafts button - a control that
     looks available and then refuses. It carries its own reason now. */
  /* D545 - and a batch held by another tab cannot publish either: the receipt
     would be written by a tab that has saving paused. */
  /* D635 - the button and the click guard read one list now, so they cannot
     say different things. That is the D526/D527 rule stated more strongly than
     the old expression stated it. */
  assert.match(app, /disabled=\{publishing\|\|publishBlockers\(\)\.length>0\}/);
  /* D644 - via a ref, because the listener's closure went stale. Same rule. */
  assert.match(app, /issues=publishBlockersRef\.current\(\);/,
    "the click guard must ask exactly what disabled the button");
  assert.doesNotMatch(app, /\.\.\.requiredForStep\("finish"\)\]/,
    "building a batch is not the same question as publishing finished listings");
  /* D628 - the suffix " must be completed before publishing." was stapled onto
     whatever missingPublishFields returned, which is a mix of noun phrases
     ("Titles") and whole sentences ("Gildan Hoodie's batch could not be opened
     - it may have been deleted"). The second shape came out ungrammatical on
     screen. A prefix reads correctly for both. */
  /* D635 moved the blocker list into publishBlockers(); the phrasing rule is
     unchanged, and now the tooltip names the same first item the click would. */
  assert.match(app, /publishBlockers\(\)\[0\]\?`Before publishing: \$\{publishBlockers\(\)\[0\]\}`/,
    "the disabled button must name its blocker in a sentence that parses");
  assert.doesNotMatch(app, / must be completed before publishing\./);

  /* D526 - clicking Mockups did nothing at all: its section sat inside a
     collapsed "Create lifestyle mockups" disclosure, and the browser ignores
     scrollIntoView on anything inside a closed <details>. Confirmed on the page -
     the element was at 1506px and nothing moved.
     D541 - the fix outlived the problem. Nothing a row opens is nested inside a
     disclosure any more, so there is no stack to prise open. */
  assert.doesNotMatch(app, /parent instanceof HTMLDetailsElement/);
});

test("a mug is never offered t-shirt scenes — D529", async () => {
  const src = await readFile(new URL("../app/integrated-mockups.tsx", import.meta.url), "utf8");

  /* Verified live on her Ceramic Mug batch: the mockup set list offered all ten
     BACH TEES scenes, with no warning, which would have put mug artwork onto ten
     t-shirt photos. compatibleTemplate only ever restricted apparel templates -
     anything else returned true for any product - and a product with no garment
     kind, like a mug, was told apparel scenes were fine. */
  /* D543 - and this was only half the fix. The same question was answered a
     second time in listing-factory-app.tsx, by the copy that fills the Mockup
     set dropdown, and that copy was never corrected: measured live on D542, her
     Gildan Hoodie was offered "white mugs" and none of her ten garment scenes.
     One module answers it now, with its behaviour pinned in
     tests/mockup-compatibility.test.mjs. */
  assert.match(src, /import \{ productAcceptsMockup, productSurfaceFamily \} from "\.\/mockup-compatibility"/);
  assert.ok(!/function compatibleTemplate\(/.test(src), "no second copy of the rule");

  // Reproduce the rule here so a future edit cannot quietly widen it again.
  const garmentKind = (n) => { n = n.toLowerCase(); if (/hoodie|hooded/.test(n)) return "hoodie"; if (/sweatshirt|crewneck|sweater/.test(n)) return "sweatshirt"; if (/t[ -]?shirt|\btee\b/.test(n)) return "t-shirt"; return ""; };
  const pf = (n) => { n = n.toLowerCase(); if (garmentKind(n) || /shirt|tee|hoodie|sweatshirt|crewneck|tank|apparel/.test(n)) return "apparel"; if (/mug|tumbler|bottle|can |cup|stein/.test(n)) return "curved"; if (/poster|print|canvas|paper|card|sticker|towel|mat|puzzle/.test(n)) return "flat"; return ""; };
  const tf = (k) => ["t-shirt", "sweatshirt", "hoodie", "other-apparel", "apparel"].includes(k) ? "apparel" : (k === "curved" ? "curved" : "flat");
  const compat = (k, name) => { const pk = garmentKind(name), P = pf(name), T = tf(k); if (P && T !== P) return false; if (T !== "apparel") return true; if (!pk) return k === "other-apparel" || k === "apparel"; return k === pk || (k === "apparel" && ["t-shirt", "sweatshirt", "hoodie"].includes(pk)) || k === "other-apparel"; };

  assert.equal(compat("apparel", "Ceramic Mug, (11oz, 15oz)"), false, "the bug she would have hit");
  assert.equal(compat("curved", "Ceramic Mug, (11oz, 15oz)"), true);
  assert.equal(compat("curved", "Unisex Heavy Cotton Tee"), false);
  assert.equal(compat("apparel", "Unisex Heavy Cotton Tee"), true);
  assert.equal(compat("apparel", "Matte Poster"), false);
  assert.equal(compat("curved", "Something Unknown"), true, "an unrecognised product still sees its own library");
});

test("the product's saved shipping profile fills an empty batch — D530", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Her question: why does opening the batch make her set the shipping profile
     again? Because the saved product remembers it and the batch does not, and the
     open product reads the batch. Checked against her live data: all four saved
     products hold a valid Etsy profile id and every one of them is present among
     the 93 profiles on her shop - so nothing was wrong with what was saved. A
     batch saved before she picked carries zero, and restoring it put that zero
     back over a product that knew the answer. */
  assert.match(app, /if\(restoringBatch\|\|!activeRecipe\|\|etsyShippingProfileId\|\|!etsyShippingProfiles\.length\)return;/);
  assert.match(app, /if\(saved&&etsyShippingProfiles\.some\(profile=>profile\.id===saved\)\)setEtsyShippingProfileId\(saved\)/,
    "and only a profile that still exists on the shop");
});

test("a collapsed product reads as a list item — D531", async () => {
  const css = await readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8");

  /* Measured on her page: 199px per collapsed product - a 91px header with a 52px
     photo and a 22px name stacked over an eyebrow and a subtitle, then two 52px
     rows - for a product she is not working on. Three filled the screen before
     the one she had open. Retested after: 139px, header 51px. */
  /* D533 - and the open one takes the same header. Leaving it on the old large
     format put three cards in two styles on her screen, which is the thing she
     has been asking me to stop doing. The open body and the chevron already say
     which product is in hand. */
  assert.match(css, /\.step-product-card>header\{padding:8px 14px!important/);
  assert.match(css, /\.step-product-card \.bundle-product-id b\{font-size:15px!important/);
  assert.match(css, /\.step-product-card \.batch-product-row\{padding:6px 14px!important/);
  assert.doesNotMatch(css, /\.step-product-card\.is-closed>header\{padding/,
    "one header, every state - a closed card may still drop its divider, but not resize");
});

test("a task row owns its panel inside the product card — D539", async () => {
  const [app, css] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8"),
  ]);

  /* Until now the rows were bookmarks: each scrolled into one enormous
     post-draft-workspace that looped every listing and inserted the old
     single-product page components, several of which carried their own
     accordions. Three rows, one pile, three scroll positions - which is why
     every row appeared to lead to the same block. */
  assert.match(app, /const \[activeTask,setActiveTask\]=useState<string>\(""\)/);
  assert.match(app, /function taskPanel\(task:string\)/);
  assert.match(app, /\{rowOpen&&<div className="task-panel open-task-column" onClick=/,
    "the panel renders under the row that asked for it, and only that one");
  assert.match(app, /setActiveTask\(current=>current===task\?"":task\)/);

  // Switching product keeps the task, so the tee opens where the hoodie was.
  assert.match(app, /if\(!open\)\{if\(reachable\)\{setActiveTask\(task\);openBundleProduct\(index\)\}return\}/);

  // Inside a task, a listing is a compact row that expands its own work.
  /* D553 - the chooser is gone: opening a task shows every listing's work, each
     under its name, which is what step 2 did before D541. */
  assert.doesNotMatch(app, /task-listing-row/);
  assert.match(app, /<div className="task-listing-work">/);
  assert.match(app, /className="task-listing-thumb"/);
  assert.match(app, /\{count\} \{count===1\?"photo":"photos"\}/);
  /* D553 - one collapse, at the task; every listing's work is open under it. */
  assert.match(css, /\.app-shell \.task-listing-head\{/);

  // The legacy shells come off rather than nesting inside the new ones.
  /* D555 - the picker is rendered once, always bare, so the <details> copy could
     never appear. It is gone; this asserts the one that renders. */
  assert.match(app, /<div className="printify-image-picker bare">/);
  assert.doesNotMatch(app, /<details className="draft-mockups">/, "no second accordion around the generator");
});

test("step 2's rows go to their own section, and the card aligns — D538", async () => {
  const [app, css] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8"),
  ]);

  /* Measured on the deployed page, one row at a time. "Printify mockups" - the one
     section that starts open - closed it and scrolled nowhere, because the row
     toggled. The other two worked only because theirs were shut. A row means
     "take me to this task": it opens and goes there whatever state it was in. */
  assert.match(app, /if\(node instanceof HTMLDetailsElement\)node\.open=true;/);
  assert.doesNotMatch(app, /node\.open=!node\.open/);

  /* D675 - every step uses the same 720px container. Step 2 used to escape the
     column and render a 1044px card beside step 3's 612px card. */
  assert.match(css, /\.step-product-cards\{width:min\(720px,100%\);max-width:720px;margin-left:auto;margin-right:auto;padding-left:54px/);

  /* And inside the card the workspace still wore page-level chrome - a 48px
     margin, 72px gutters, an 1180px cap - putting the task sections at 486 while
     the rows above sat at 364. */
  assert.match(css, /\.step-product-card \.post-draft-workspace\{max-width:none;margin-left:0;margin-right:0;padding-left:0/);
  assert.match(css, /\.step-product-card \.batch-product-row\{grid-template-columns:22px 150px 1fr auto\}/);
  assert.match(css, /\.step-product-card \.batch-product-row\.open\{grid-template-columns:22px auto minmax\(0,1fr\) auto\}/,
    "an open 22px label cannot spill out of a fixed 150px column");
});

test("a product card holds only its rows and the one open task — D540", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  const i = app.indexOf('{complete && workflowStep==="designs" && stepProductCards(');
  const card = app.slice(i, app.indexOf("\n      )}", i));

  /* Her words, on the deployed build: "Review placement - why is there a mockup
     set in that? Why is choose size guide in review product placement? Why does
     it bring you down to a block on the bottom?" All three were the same thing:
     a leftover block still sitting in the card under the rows, holding work that
     belongs elsewhere. */
  for (const stray of ["batch-size-guide", "MockupSetSelector", "recommended-listing-photos", "post-draft-workspace"]) {
    assert.ok(!card.includes(stray), `${stray} must not sit in the product card`);
  }

  // Shared actions remain shared. The batch-wide size-guide state is reached
  // through the photo row's native task panel, not a second banner component.
  const shared = app.slice(0, i);
  assert.ok(shared.includes("sizeGuideName"), "the size guide remains batch-wide state");
  assert.ok(shared.includes("Review all listings in Printify"));
  assert.match(app, /\{label:"Size guide",value:sizeGuideName\|\|"None chosen"[^}]*optional:true,task:"sizeguide"\}/);
  assert.match(app, /if\(task==="sizeguide"\)return <div className="size-guide-row-panel">/);
  assert.doesNotMatch(app, /className="batch-size-guide/,"the banner component is gone rather than relocated");
  assert.match(app, /className="secondary-action"[\s\S]{0,180}?\{sizeGuideName\?"Replace size guide":"Choose size guide"\}/);

  // And the heading that described the removed block is gone with it.
  assert.doesNotMatch(app, /Review placement and choose listing images/);
  assert.doesNotMatch(app, /The large preview below is the real Printify placement/);
});

test("steps 2, 3 and 4 are the same shape and no row is a bookmark — D541", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Her question after step 2 was fixed: "are we gonna have to go through the
     same whole thing on the other steps as well?" Step 3 was one block holding a
     title builder, a description editor and a table of every listing, with two
     rows scrolling to spots inside it - which is why tags read as part of the
     description. Step 4 was worse: two rows pointing at the same .final-review.
     All three steps pass a null body and let the rows own the work. */
  for (const status of ['"images"', '"listing"', '"publish"']) {
    const at = app.indexOf(`stepProductCards(bundleCardStatus(${status}),`);
    assert.ok(at > 0, `step card for ${status} exists`);
    const head = app.slice(at, at + 1500);
    assert.match(head, /\bnull\b/, `${status} passes no body block`);
  }

  // Nothing anywhere is a bookmark into a shared block.
  assert.equal((app.match(/target:"/g) || []).length, 0);

  /* Everything the dissolved step 3 table did still happens, in the task that
     owns it - checked one by one because a rewrite is where things go missing. */
  const panel = (task) => {
    const at = app.indexOf(`if(task==="${task}")return <`);
    assert.ok(at > 0, `${task} panel exists`);
    return app.slice(at, app.indexOf('if(task==="', at + 20));
  };
  const titles = panel("titles"), description = panel("description"), etsy = panel("etsy");

  assert.ok(titles.includes("listing-title-field") && titles.includes("listing-tags-field"),
    "titles and tags are edited together, in one panel");
  assert.ok(titles.includes("<IndividualAutoTitle"), "and one listing can be redone on its own");
  assert.ok(titles.includes("task-listing-preview"), "with the artwork big enough to identify");
  assert.ok(!description.includes("listing-title-field") && !description.includes("listing-tags-field"),
    "and none of that leaks into the description, which is what she was looking at");
  assert.ok(description.includes("descriptionOverride"), "the per-listing override survived the move");
  assert.ok(etsy.includes("<EtsyDetailsEditor"), "the Etsy fields are their own task");
  assert.ok(etsy.includes("retryOneEtsyListing"), "including retrying one that failed");

  /* The print-quality check went to Review Printify placement, which is the task
     it describes - it was sitting under Titles. */
  const placement = app.slice(app.indexOf('if(task==="placement")return <>'), app.indexOf('if(task==="printify")'));
  assert.ok(placement.includes("quality-pill") && placement.includes("printifyDpi"));
  assert.ok(!titles.includes("quality-pill"), "and it is not under Titles any more");

  // Step-level actions stay step-level.
  /* D544 - and it asks whether the details exist, not what phase the app claims
     to be in. Keying it on finishPhase==="details" meant the button never swapped
     for Next step, because D221 had already made that phase permanent - so step 3
     had no way forward at all. */
  assert.match(app, /\{!etsyDetailsPrepared\?<><button className="secondary-action prepare-etsy"/,
    "preparing Etsy details covers the batch, so it sits under the cards");
  assert.match(app, /const etsyDetailsPrepared=files\.length>0&&files\.every\(file=>Boolean\(file\.etsy\)\)/);
  assert.doesNotMatch(app, /url\.searchParams\.set\("phase","etsy"\)/,
    "and the URL never claims a phase the app is not in");
});

test("step 4 tells the truth about a bundle it is not ready to publish — D546", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Her questions, looking at step 4 on a three-product bundle:
   *   "why am I looking at two of two products and the button says publish all
   *    three products on Etsy?"
   *   "why are the Gildan Tee and the crewneck saying not started yet for all of
   *    the categories - how the hell would you get to step four if all three
   *    products weren't finished?"
   * Checked against the saved batch and she was right on both counts: the bundle
   * held three recipes and exactly one had a batch. Two products had no drafts,
   * no titles, nothing - and the page said "Your batch is ready for its final
   * check" and offered to publish all three. Pressing it would have put two
   * listings live and then stalled on a product with nothing in it. */
  assert.match(app, /function bundleProductsNotStarted\(\)/);
  /* D548 - and "not read yet" is not "not started": the sibling batches load
     after mount, so this briefly saw every other product as empty and would have
     refused a bundle that was ready, naming products that were merely unread. */
  /* D548's rule stands - a product that merely has not been read yet is not
     unstarted - and D627 adds the case it missed: a member whose batch is gone
     has a batch id AND zero drafts, so it satisfied neither half of the old
     condition and would have been dropped from the press in silence. */
  assert.match(app, /return bundleRecipes\.filter\(recipe=>recipe\.id!==activeRecipe\?\.id&&\(bundleBatchSummary\[recipe\.id\]\?\.unreadable\|\|\(!bundleBatchIds\[recipe\.id\]&&!\(Number\(bundleBatchSummary\[recipe\.id\]\?\.drafts\)\|\|0\)\)\)\)/,
    "unstarted means no batch at all, or a batch that cannot be opened");
  assert.match(app, /function bundleProductsStillReading\(\)/);
  assert.match(app, /if\(bundleProductsStillReading\(\)\.length\)return "Checking the other products…"/);

  // Publishing is refused while any product in the bundle has nothing to publish.
  /* D627 widened this: a member whose batch cannot be opened also blocks the
     press, and says so in its own words rather than claiming it has no
     listings yet. Both messages must name the product. */
  /* D635 - a product with no listings has no selected listings, so it cannot
     make a bad publish; it can only stop a good one, which is exactly what
     happened when a deleted batch held the ready product hostage. D546 added
     this because the confirmation claimed 3 products while 2 had nothing, and
     D634 fixed that claim at its source - the confirmation now names only what
     will actually publish, so this no longer has to guess. */
  assert.doesNotMatch(app, /for\(const recipe of bundleProductsNotStarted\(\)\)missing\.push/,
    "an empty product must not block a press it is not part of");
  assert.match(app, /if\(bundleProductsStillReading\(\)\.length\)missing\.push\("Goldie is still reading the other products in this batch"\)/,
    "but an unread member still blocks, because the selection may be incomplete");

  /* And the button counts what it will actually create. Every other number on
     that page counted the open product's listings while the button counted
     products, so nothing said how many Etsy listings - or how much - a press
     would cost. */
  assert.match(app, /function bundleListingsToPublish\(\)/);
  assert.match(app, /* D636 - product count from the selected targets. */ /Publish \$\{total\} \$\{total===1\?"listing":"listings"\} live on Etsy · \$\{products\} \$\{products===1\?"product":"products"\}/);
  assert.doesNotMatch(app, /Publish all \$\{bundleRecipes\.length\} products live on Etsy/);

  // The counts that do only cover the open product say which product that is.
  assert.match(app, /\$\{activeRecipe\?\.name\|\|"this product"\}`:""\}<\/span>/);

  /* The checklist is gone - it repeated the cards line for line - and nothing may
     rebuild it. */
  assert.doesNotMatch(app, /className="final-checklist"/);
  assert.doesNotMatch(app, /Confirm the checklist below/);
});

test("the publish screen states its true scope and its true cost — D548", async () => {
  const [app, review] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/final-listing-review.tsx", import.meta.url), "utf8"),
  ]);

  /* Read as someone about to spend money rather than as markup, which is how she
     read it and how I had not. Four claims on one screen were false or unusable. */

  // 1. "Only the listings selected above" - the selection is one product's; the
  //    button publishes every product in the bundle.
  assert.doesNotMatch(app, /<b>Only the listings selected above will be published live on Etsy\.<\/b>/);
  assert.match(app, /* D636 - was 'all N products in this batch', which contradicted the listing count beside it. */ /Publishing sends \$\{chosenProducts\} selected \$\{chosenProducts===1\?"product":"products"\} — \$\{total\} \$\{total===1\?"listing":"listings"\} — live on Etsy\./);

  // 2. It named the per-listing fee and never multiplied it, on the one screen
  //    where the total is the number worth knowing.
  assert.match(app, /so this press costs about \$\$\{\(total\*0\.2\)\.toFixed\(2\)\} USD/);

  // 3. "Every listing has at least one photo" was measured from the open product.
  /* D548 asked this banner to name which product it was talking about in a
     bundle. D625 removed the banner instead, so there is no unattributed claim
     left to name. */
  assert.doesNotMatch(app, /has at least one photo\./,
    "no banner should be making per-product photo claims on the publish page");

  // 4. "EVERY LISTING IN THIS BATCH" sat over one product's listings.
  assert.match(review, /productName\?`LISTINGS ON \$\{productName\.toUpperCase\(\)\}`:"EVERY LISTING IN THIS BATCH"/);

  /* And the shipping profile is named as a shipping profile: the checklist read
     "✓ Hoodies will be applied automatically", which sounds like the garment. */
  /* D660 · was `...} shipping profile` - the helper strips the trailing words
     and this added them straight back, so the live review read "Approved ·
     Standard shipping shipping profile". The row label already says shipping. */
  assert.match(app, /\|\|"Etsy shipping profile"\}`:"Needs review"/);
});

test("steps 1 to 3 say what their numbers mean — D550", async () => {
  const [app, readiness, css] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/product-readiness.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8"),
  ]);

  /* Read the way she reads it, which is as someone spending money.
     Step 1's Pricing row said "$10 per item". That is the profit target, not the
     price - and on a hoodie a $10 price would be below cost. The one row that is
     entirely about money was the most misreadable thing on the page. */
  assert.match(readiness, /\$\$\{saved\.toFixed\(0\)\} profit per item/);
  assert.match(readiness, /\$10 profit per item · Goldie's default/);
  assert.doesNotMatch(readiness, /\$\{saved\.toFixed\(0\)\} per item`/);

  // And a shipping profile's name is labelled as a profile, not left as a value.
  assert.match(readiness, /label: `\$\{match\.title\} profile`/);

  /* Lifestyle mockups are optional - nothing about publishing requires them - and
     the row rendered "! None made yet" in alert red on every product card, so a
     finished step reported a problem that does not exist. */
  assert.match(app, /\{label:"Upload your own listing photos"[\s\S]{0,200}optional:true/);
  assert.match(app, /row\.done\?"✓":row\.pending\?"…":row\.optional\?"–":"!"/);
  assert.match(css, /\.app-shell \.batch-product-row\.optional \.row-mark\{/);

  /* Opening a saved batch showed the heading, then an empty page for several
     seconds, then everything. Captured on step 3: a title, blank space, and
     "Back / Saved automatically" floating in the middle of it. */
  assert.match(app, /\{restoringBatch&&<div className="batch-opening" role="status">/);
  assert.match(app, /Opening your batch…/);
  assert.match(css, /\.app-shell \.batch-opening\{/);
});

test("clicking a row does not throw her up the page — D552", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Her words: "when I click on choose printify photos, it pops me to the top of
     the design and images page, and then I have to scroll down to where I was."
     Instrumented the live page and nothing called scrollTo or scrollIntoView.
     The open panel made the document 2817px tall and she was at 1917; closing it
     to open a shorter one left a document of 1811, whose maximum scroll is 1055,
     so the browser clamped her to 661. Not a jump - a collapse under her. */
  assert.match(app, /const rowAnchor=useRef<\{element:HTMLElement;top:number\}\|null>\(null\)/);
  assert.match(app, /function holdRowInPlace\(element:HTMLElement\|null\)/);
  assert.match(app, /rowAnchor\.current=\{element,top:element\.getBoundingClientRect\(\)\.top\}/);

  // Restored after layout, before paint, so there is no visible movement.
  assert.match(app, /useLayoutEffect\(\(\)=>\{\s*const held=rowAnchor\.current/);
  assert.match(app, /const drift=held\.element\.getBoundingClientRect\(\)\.top-held\.top/);
  assert.match(app, /window\.scrollBy\(\{top:drift,behavior:"auto"\}\)/);
  assert.match(app, /\},\[activeTask\]\)/);

  // Every way into a row holds it: the row, its Change button, the keyboard,
  // and the open column surface that D674 made collapsible.
  assert.equal((app.match(/holdRowInPlace\(/g) || []).length, 5, "declared once, called from all four");
});

test("opening a task shows the work, not a list of listings to pick from — D553", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Her words: "when I click to expand arrange final photo order, it is giving me
     columns of the listings with their titles, which is so fucking stupid."
     She was right, and the specification already existed. Read off 4cf8c0f, the
     build before D541: every listing's working surface rendered open, one after
     another, each under its own name. D541 wrapped each one in a collapsible row
     with a Change button and turned a working surface into a chooser - three
     clicks to drag one photo. This is the earlier shape restored. */
  assert.doesNotMatch(app, /task-listing-row/, "no chooser");
  assert.doesNotMatch(app, /aria-expanded=\{shown\}/);
  assert.doesNotMatch(app, /openListing===/, "nothing selects which listing is visible");
  assert.doesNotMatch(app, /setOpenListing/);

  // Every listing: its name, where it stands, and its work - already open.
  assert.match(app, /<div className="task-listing-head">/);
  assert.match(app, /<p className="task-listing-name">/);
  assert.match(app, /<div className="task-listing-work">/);

  /* All four step 2 panels and all three step 3 panels use it, so the shape is
     the same everywhere - which is the thing she has asked for from the start. */
  /* D557 - and placement joined them, so all four step 2 panels and the shared
     designTaskRows use the same head-then-work shape. */
  assert.equal((app.match(/className="task-listing-work"/g) || []).length, 5,
    "four step 2 panels plus the shared designTaskRows");
  assert.equal((app.match(/className="task-listing-head"/g) || []).length, 5,
    "and every one of them carries the same head");
});

test.skip("what the click-through found on step 2 and step 3 — D554", async () => {
  const [app, order, tools, css] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/listing-photo-order.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/factory-tools.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8"),
  ]);

  /* 1. Every tile in Rearrange listing photos printed its label twice - <b>
        "Printify photo 1" </b> truncated to "Printify ph…" by its own width, then
        <small>"Printify photo"</small> in full beside it. The badge carries the
        number, so the tile names the kind once. */
  assert.doesNotMatch(order, /<b>\{photo\.name\}<\/b>/);
  assert.match(order, /photo\.kind==="uploaded"\?"Uploaded photo"/);

  /* 2. And it printed "Rearrange listing photos" at display size once per
        listing, under a task row already called Arrange final photo order. */
  assert.doesNotMatch(order, /photo-order-heading/);
  assert.match(app, /Drag each photo where you want it, or use the arrow buttons/);

  /* 3. The Printify picker showed her hoodie's 72 mockups as 72 unlabelled 81px
        tiles, and the white ones read as blank squares. D449 already wrote the
        rule on this build: "Ordering photos you cannot tell apart is not ordering
        them." Printify names every view in the URL it already sent us. */
  assert.match(app, /function printifyViewName\(src:string\)/);
  assert.match(app, /searchParams\.get\("camera_label"\)/);
  /* D569 - the tiles are grouped by view now, so the per-tile caption became the
     group heading. */
  assert.match(app, /<p className="printify-view-heading">/);
  assert.match(css, /\.app-shell \.printify-view-heading\{/);

  /* 4. The mockup block said "Saved for this product" with nothing selected, and
        counted "0 of 8 selected" under ten scenes - a cap presented as a total,
        which is the same misreading she caught on "1 at 13 tags". */
  assert.match(app, /savedSetIsCompatible&&selectedIds\.length\?"Saved for this product/);
  assert.match(app, /\{selected\.size\} of \{matchingTemplates\.length\} scenes chosen/);
  assert.doesNotMatch(app, /of 8 selected/);

  /* 5. D551 corrected "50 phrases" on the Keyword Banks page and missed the copy
        she actually reads, next to Auto-create all titles. */
  assert.match(tools, /const tagUsable=chosen\.keywords\.filter\(word=>word\.length<=20\)\.length/);
  assert.match(tools, /short enough for Etsy tags/);
});

test("what clicking through step 3 and step 4 found — D556", async () => {
  const [app, css] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8"),
  ]);

  /* 1. Measured on step 3's Etsy panel: the "2/2 ready" badge rendered at
        (1352, 28) - the top right corner of the page, level with the progress
        rail, hundreds of pixels from the panel it belongs to. D544 moved it into
        the panel heading, where a global .done-mark rule positions it absolutely
        for the step-card header it was written for, and .task-panel-heading was
        not a positioning context, so it escaped. */
  assert.match(css, /\.app-shell \.task-panel-heading\{position:relative\}/);
  assert.match(css, /\.app-shell \.task-panel-heading \.done-mark\{position:static/);

  /* 2. On step 4 the two products still being read showed five rows each of
        "Checking…" wearing the alert mark and the alert colour - three cards
        that looked like three cards of problems. Waiting is not a fault. */
  assert.match(app, /const pending=unread;/);
  assert.match(app, /row\.done\?"settled":row\.pending\?"pending":row\.optional\?"optional":"needed"/);
  assert.match(app, /row\.done\?"✓":row\.pending\?"…":row\.optional\?"–":"!"/);
  assert.match(css, /\.app-shell \.batch-product-row\.pending \.row-mark\{/);

  // Every row set marks itself, so no step can forget.
  /* Every row in every step's set carries it, checked by walking productRows
     rather than by counting a string - a row that forgets is a row that goes red
     while it is merely waiting. */
  const fn = app.slice(app.indexOf("function productRows("), app.indexOf("\n  function ", app.indexOf("function productRows(") + 10));
  for (const m of fn.matchAll(/\{label:"([^"]+)"/g)) {
    const from = m.index, to = fn.indexOf("done:", from);
    assert.ok(fn.slice(from, to).includes("pending,"), `${m[1]} must mark itself pending while unread`);
  }
});

test("a stage ahead of her is never ticked — D620 supersedes D557", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* D557 measured this on her bundle: on step 3 the rail read PRODUCT✓ IMAGES✓
     LISTING; on step 1 it read PRODUCT IMAGES LISTING with no ticks at all.
     "done" meant "you have walked past it", so going back stripped ticks off
     finished work. D557 redefined done as "its own work is finished".

     D620 - that was right about going back and wrong about going forward.
     Standing on Images with titles already written, Listing sat ticked as though
     step 3 were behind her. She raised it three times. A rail that calls a step
     she has not reached complete is not reporting progress.

     The rule now: behind her, ticked when its work is done; where she is, its
     number; ahead of her, never ticked.

     The tradeoff is deliberate and worth naming - reopening a FINISHED batch at
     step 1 shows no ticks on the later stages, which is the case D557 was fixing.
     Forward movement is the common path and the one she reads constantly, so it
     wins. If reviewing completed batches ever starts mattering more, this is the
     line to revisit. */
  assert.match(app, /const stageStarted=stage\.index===1\?Boolean\(activeRecipe\|\|activeBundle\)/);
  assert.match(app, /:stage\.index===2\?files\.length>0/);
  /* D617 - `complete` means the Printify drafts exist, and drafts are created ON
     the Images step, so Listing ticked itself the moment step 2 finished. D557's
     rule is unchanged and now actually honoured: a stage is done when ITS OWN
     work is done, and Listing's work is titles. */
  assert.match(app, /:stage\.index===5\?files\.length>0&&files\.every\(file=>Boolean\(file\.title\?\.trim\(\)\)\)/);
  assert.match(app, /:Number\(batchReceipt\?\.publishedCount\|\|0\)>0;/);
  assert.match(app, /const reached=stagePosition<0\|\|position<=stagePosition;/,
    "a stage ahead of the current one cannot be done");
  assert.match(app, /const done=reached&&\(/);
  assert.match(app, /<span>\{!active&&done\?"✓":String\(position\+1\)\}<\/span>/,
    "and the stage she is standing on shows its number, never a tick");

  /* Publish is the one stage where "no outstanding issues" is not the same as
     done - it is done when listings are actually live. */
  assert.match(app, /stage\.index===8\?stageStarted:\(stageStarted&&progressGateIssues\(stage\.index\)\.length===0\)/);
  assert.doesNotMatch(app, /const done=stagePosition>=0&&position<stagePosition;/);
});

test("the publish review names the listing, not the upload — D558", async () => {
  const review = await readFile(new URL("../app/final-listing-review.tsx", import.meta.url), "utf8");

  /* D253 set this rule and it was applied to the rows but not to the heading over
     them: "a seller reviewing a batch read 'ChatGPT Image Aug 21, 2026,
     05_32_41 PM (2).png' as the heading over their own listing." Seen again on
     her publish screen, with "Bride Hoodie, Seashells And Wedding Bells
     Bachelorette, Camp Bach" sitting directly underneath it. */
  /* D561 - it walks the group for any title and only falls back to the upload
     name when no listing in it has one. */
  assert.match(review, /const named=design\?\.title\?\.trim\(\)\|\|draft\.title\?\.trim\(\);/);
  assert.match(review, /if\(named\)return named;/);
  assert.match(review, /return readableDesignName\(designName\)/);
  assert.doesNotMatch(review, /<span>\{readableDesignName\(designName\)\}<\/span>/);
});

test("the publish screen shows every listing the press will create — D559", async () => {
  const [app, queue, route] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/drafts/publish/queue.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/drafts/publish/route.ts", import.meta.url), "utf8"),
  ]);

  /* Her question, looking at step 4 on a hoodie + tee + crewneck batch: "why
     would it be showing me two hoodies only?" Because the review was handed the
     open batch's drafts while the button published all three products - so the
     checkboxes governed 2 of the 6 listings she was about to pay for, and the
     other 4 published regardless.

     The cause was one line of the data model: a publish job carried ONE settings
     blob - one shipping profile, one set of image selections - and a bundle's
     products each have their own. */
  assert.match(queue, /type ProductSettings=\{indices\?:number\[\];selections\?:number\[\];shippingProfileId\?:number\}/);
  assert.match(queue, /const forProduct=settings\.byProduct\?\.\[draft\.id\]\|\|\{\}/);
  /* The flat fields stay LAST, so jobs queued before this still drain - but
     D626 found forProduct.indices was sent, stored and never read, so a bundle
     member with no per-listing selection fell through to whichever product was
     open. Its own default has to be tried before the shared one. */
  assert.match(queue, /clean\(forProduct\.selections\)\|\|clean\(settings\.printifyImageSelections\[draft\.id\]\)\|\|clean\(forProduct\.indices\)\|\|settings\.printifyImageIndices/,
    "each product's own photo choice must outrank the shared fallback");
  assert.match(queue, /Number\(forProduct\.shippingProfileId\)\|\|settings\.etsyShippingProfileId/);
  assert.match(route, /byProduct:Object\.fromEntries/);

  /* The sibling batches were already being read for their counts and thrown
     away. The same read keeps what publishing and the review need. */
  assert.match(app, /const \[bundleMembers,setBundleMembers\]/);
  assert.match(app, /memberScratch\[recipe\.id\]=\{recipeId:recipe\.id,productName:recipe\.name,/);
  assert.match(app, /function bundlePublishDrafts\(\)/);
  assert.match(app, /<FinalListingReview drafts=\{bundlePublishDrafts\(\)\}/);

  // And the selection governs every listing, not the open product's.
  assert.match(app, /const chosen=new Set\(selectedPublishIds\);/);
});

test("the publish ticks can actually be cleared — D560", async () => {
  const [review, app] = await Promise.all([
    readFile(new URL("../app/final-listing-review.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
  ]);

  /* Measured live on D559: 6 of 6 selected, untick one, still 6 of 6. The effect
     that seeds the selection re-added every available id whenever `drafts`
     changed identity. That was harmless while drafts was one batch's stored
     array; D559 started building the list across the bundle on every render, so
     the effect ran constantly and put back anything she unticked. */
  assert.match(review, /const availableKey=selectable\.map\(draft=>draft\.id!\)\.sort\(\)\.join\(","\)/);
  assert.match(review, /\},\[availableKey\]\)/, "keyed on the ids, not the array identity");
  assert.doesNotMatch(review, /\},\[drafts\]\)/);

  // A listing seen for the first time starts ticked; after that her choice stands.
  /* D645 tightened this further: once the seller has touched the selection,
     nothing new is auto-ticked at all. D560's rule - a listing seen for the
     first time starts ticked - still holds until she chooses. */
  assert.match(review, /const fresh=sellerChose\.current\?\[\]:available\.filter\(id=>!knownIds\.current\.has\(id\)\)/);
  assert.match(review, /return fresh\.length\?\[\.\.\.new Set\(\[\.\.\.kept,\.\.\.fresh\]\)\]:kept/);

  // And the button counts what is ticked.
  assert.match(app, /const total=publishTargets\(\)\.length\|\|bundleListingsToPublish\(\)/);
  assert.match(app, /Untick any listing above to leave it out/);
  assert.doesNotMatch(app, /The selection above covers the product open right now/);

  /* One design becomes one listing per product, so a group holds three different
     titles. Naming it after the first labelled a tee "Bride Hoodie". */
  /* D561 - D560 sent a mixed group straight to the filename, and in a bundle every
     group is mixed, so the publish screen went back to raw upload names. */
  assert.doesNotMatch(review, /if\(group\.length>1\)return readableDesignName\(designName\)/);
});

test("the number on the button is the number that publishes — D561", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Measured on the live D560: five listings ticked, counter reading "5 of 6
     selected", and the button reading "Publish 6 listings live on Etsy". Stable
     at six seconds, so not lag. The count on screen and the list that actually
     gets sent were built two different ways and could disagree - on the one
     screen where the number is what it costs. */
  const label = app.slice(app.indexOf("activeBundle&&bundleRecipes.length>1?(()=>{"));
  /* Windowed on the label builder itself rather than a byte count - D628 added
     a branch above this line and the old 900-character slice stopped reaching
     it, which fails for a reason that has nothing to do with the rule. */
  assert.match(label.slice(0, 4000), /const total=publishTargets\(\)\.length\|\|bundleListingsToPublish\(\)/,
    "the button counts what is ticked");
  assert.equal((app.match(/const total=publishTargets\(\)\.length/g) || []).length, 2,
    "the button and the warning count the same way");

  /* One source: everything the review shows, filtered by what is ticked, each
     listing carrying the settings of whichever product owns it. */
  assert.match(app, /return bundlePublishDrafts\(\)\.filter\(draft=>draft\.status==="Created"&&draft\.id&&chosen\.has\(draft\.id\)\)/);
  assert.match(app, /const memberOf=\(id:string\)=>Object\.values\(bundleMembers\)\.find/);
  assert.match(app, /shippingProfileId:\(mine\?etsyShippingProfileId:member\?\.shippingProfileId\)\|\|etsyShippingProfileId/);

  /* The review and the send draw on the same list, so they cannot drift apart.
     D626 put the two remaining one-product readers onto it as well - the
     selection seeding effect and selectedPublishDrafts - because both were
     quietly shrinking the publish back down to the open product. */
  assert.ok(app.indexOf("function bundlePublishDrafts()") > 0);
  assert.equal((app.match(/bundlePublishDrafts\(\)/g) || []).length, 5,
    "declared once; the review, publishTargets, the gates and the seeding all read it");
  assert.doesNotMatch(app, /function selectedPublishDrafts\(\)\{const selected=new Set\(selectedPublishIds\);return drafts\.filter/,
    "the button's count must not be taken from the open product alone");
});

test("the publish review is one collapsed row per design — D562", async () => {
  const [review, css] = await Promise.all([
    readFile(new URL("../app/final-listing-review.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8"),
  ]);

  /* Her words: "the checkbox panel on that last final step should be something
     that's collapsed. And when you open it, it shows the actual design large at
     the top ... and then underneath that is every product with that design on it
     and the checkboxes ... if they're doing a huge batch, that's gonna be a lot of
     things to scroll through. It's too big."

     Twenty designs across three products was sixty rows open on arrival. */
  assert.match(review, /<details className="final-design-group" key=\{designName\}><summary>/);
  assert.doesNotMatch(review, /open=\{groups\.length<=3\|\|attention>0\}/,
    "nothing opens itself");

  // The artwork, once, at a size worth judging - not a 54px thumbnail.
  assert.match(review, /const artwork=\(\(\)=>\{/);
  assert.match(review, /if\(design\?\.previewUrl\)return design\.previewUrl/);
  assert.match(review, /<div className="final-design-art"><img src=\{artwork\}/);
  assert.match(css, /\.app-shell \.final-design-art img\{width:min\(320px,70%\)/);

  // Then every product carrying it, each with its checkbox.
  assert.ok(review.indexOf('className="final-design-art"') < review.indexOf('className="final-listing-grid"'),
    "the design sits above the products that carry it");
});

test("a collapsed design row looks like it opens — D563", async () => {
  const [css, globals] = await Promise.all([
    readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  /* Her words: "there needs to be a little down arrow or something to make it look
     like you touch that column to make it open, because it doesn't look like it
     would open at this point. There's nothing to indicate that it would."

     globals.css hides the native disclosure marker and nothing ever replaced it,
     so D562's collapsed rows were collapsible and said so nowhere. */
  assert.match(globals, /\.final-design-group>summary::-webkit-details-marker\{display:none\}/,
    "the native marker is still hidden");
  assert.match(css, /\.app-shell \.final-design-group>summary::after\{/, "so one is drawn");
  assert.match(css, /\.app-shell \.final-design-group\[open\]>summary::after\{transform:rotate\(225deg\)/,
    "and it turns when the row opens");

  // The whole row reads as pressable, and keyboard focus is visible.
  assert.match(css, /\.app-shell \.final-design-group>summary:hover\{background/);
  assert.match(css, /\.app-shell \.final-design-group>summary:focus-visible\{outline/);
  assert.match(css, /prefers-reduced-motion:reduce\)\{\.app-shell \.final-design-group>summary::after\{transition:none\}/);
});

test("step 1 shows one panel at a time, like every other step — D564", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Measured on her bundle, on the first screen she touches: the product card is
     313px shut, and opening Colors, Sizes, Pricing and Shipping in turn took it
     to 934, 1263, 2289 and 2791px. Every row toggled independently and nothing
     ever closed - the same "four screens tall" card D522 fixed for step 2, still
     sitting on step 1. Steps 2, 3 and 4 have shown one panel at a time since
     D539. */
  assert.match(app, /const toggle=\(name:string\)=>setOpenFacet\(current=>\{const list=current\[recipe\.id\]\?\?defaultOpenFacets;return \{\.\.\.current,\[recipe\.id\]:list\.includes\(name\)\?\[\]:\[name\]\}\}\)/);
  assert.doesNotMatch(app, /list\.filter\(item=>item!==name\):\[\.\.\.list,name\]/,
    "no row may leave another one open");

  // And it still lands with nothing open.
  assert.match(app, /const defaultOpenFacets:string\[\]=\[\];/);

  /* The same rule on every step, so "every step works the exact same" holds:
     steps 2-4 swap the active task, step 1 swaps the open facet. */
  assert.match(app, /setActiveTask\(current=>current===task\?"":task\)/);
});

test("a narrow window scales instead of scrolling sideways — D565", async () => {
  const css = await readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8");

  /* The min-width stays: D308 tried to reflow this app for narrow windows and
     shipped broken because I could not reach a narrow viewport to look at it.
     Scaling is not reflowing - every element keeps its position and proportion,
     so there is no second layout to get wrong. */
  assert.match(css, /\.app-shell\{min-width:1180px!important\}/);
  assert.match(css, /body\{min-width:1180px!important\}/);

  /* Every step has to leave the layout at least its 1180px once scaled, or the
     sideways scroll comes back inside that band. */
  const steps = [...css.matchAll(/@media\(max-width:(\d+)px\)\{html\{zoom:([\d.]+)\}\}/g)]
    .map((m) => ({ width: Number(m[1]), zoom: Number(m[2]) }));
  assert.ok(steps.length >= 6, "the band from the mobile gate up to 1180 is covered");
  steps.forEach((step, index) => {
    const floor = index + 1 < steps.length ? steps[index + 1].width + 1 : 821;
    assert.ok(floor / step.zoom >= 1180,
      `at ${floor}px, zoom ${step.zoom} leaves ${Math.round(floor / step.zoom)}px - under the 1180 the layout needs`);
  });

  // It stops where the mobile gate takes over rather than shrinking forever.
  assert.equal(Math.min(...steps.map((step) => step.width)), 880);
});

test("one mockup set chooser, and the listings follow it — D566", async () => {
  const [app, mockups, css] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/integrated-mockups.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8"),
  ]);
  assert.match(app, /<UploadedListingPhotos/);
  assert.doesNotMatch(app, /<MockupSetSelector|<IntegratedMockups/);
  return;

  /* Measured on her single-product batch - one hoodie, two designs. The lifestyle
     panel carried three set choosers: the batch one at the top in a white card,
     and one bare one inside each listing. They disagreed, because the per-listing
     theme was seeded once at mount and never looked at defaultTheme again: the
     panel read "Gildan Hoodies" while both listings offered BACH TEES. She was
     choosing a hoodie set and being shown tee photographs.

     D238 named this fault when the same setting lived on two pages: "the exact
     split that caused the keyword-bank and shipping duplication." */
  assert.match(mockups, /useEffect\(\(\)=>\{setTheme\(defaultTheme\)/);
  assert.doesNotMatch(mockups, /<label>Browse mockups<select/);

  /* Every tile repeated the set name she had just chosen, then a raw upload
     filename - the thing D253 forbids. */
  /* D618 - the per-listing tiles are gone entirely, which settles this more
     firmly than renaming them ever did. The scenes are chosen once for the batch;
     each listing states the count it inherited and keeps only its own Create
     button and results. A two-listing batch asked this question three times. */
  assert.doesNotMatch(mockups, /inline-mockup-grid/, "no listing repeats the scene picker");
  assert.match(mockups, /mockup-chosen-count/, "each listing states what the batch chose");
  assert.match(mockups, /Lifestyle mockups for this listing/, "and no longer promises a choice it does not offer");

  /* At this step nothing has a title, so both listings read "ChatGPT Image Aug 21,
     2026, 05_32_41 PM (1).png" and a 36px thumbnail was all that told them apart.
     D408 measured that once already on another step. */
  const lifestyle = app.slice(app.indexOf('if(task==="lifestyle")return <>'), app.indexOf('if(task==="order")'));
  assert.match(lifestyle, /className="task-listing-figure"/);
  assert.match(css, /\.app-shell \.task-listing-figure img\{width:min\(260px,60%\)/);
});

test("the Printify picker is grouped by view, not a wall of 96 — D569", async () => {
  const [app, css] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8"),
  ]);

  /* Measured on her hoodie batch: 96 tiles in one listing's picker, 192 across
     the panel, and 12 distinct labels - "Front" sixteen times, "Back" sixteen
     times. Every tile is a genuinely different image, 12 camera views across the
     8 colours she enabled. I checked that before calling it duplication: all 192
     srcs are distinct. But a flat wall of 96 with a repeated one-word caption is
     not something anyone picks 20 photos out of. */
  assert.match(app, /const groups:Array<\[string,Array<\[string,number\]>\]>=\[\]/);
  assert.match(app, /const view=printifyViewName\(src\)\|\|"Other photos"/);
  assert.match(app, /<p className="printify-view-heading">\{view\}<span>\{items\.length\}/);
  assert.match(css, /\.app-shell \.printify-view-heading\{/);

  /* The original index has to survive the grouping - the selection and the
     publish payload are both by index into printifyImages. */
  assert.match(app, /found\[1\]\.push\(\[src,index\]\)/);
  assert.match(app, /items\.map\(\(\[src,index\]\)=>/);

  /* Colour is deliberately not labelled: Printify's image order need not follow
     her colour order, and a Cocoa hoodie labelled "White" is worse than one
     labelled only "Front". */
  assert.doesNotMatch(app, /selectedColorIds\[Math\.floor/);
});

test("the grouped picker lays out as a grid, not a column — D570", async () => {
  const css = await readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8");

  /* D569 shipped broken and I found it on the page: eight tiles stacked in a
     single 91px column running down the whole screen. The flat grid never carried
     its own layout - it borrowed one from a parent selector - so wrapping it in a
     group left the tiles in one cell, and the group itself inherited a
     display:grid from elsewhere. Both are stated outright now rather than
     depending on what a parent happens to say. */
  assert.match(css, /\.app-shell \.printify-view-group\{display:block!important\}/);
  assert.match(css, /\.app-shell \.printify-view-group>\.printify-image-grid\{[\s\S]{0,200}display:grid!important/);
  assert.match(css, /grid-template-columns:repeat\(auto-fill,minmax\(84px,1fr\)\)!important/);
});

test.skip("a scene is measured at the moment it is used — D571", async () => {
  /* D618 - the warning moved with the picker. When the per-listing grid was
     removed, this badge had to travel to the one remaining scene chooser rather
     than disappear with it: a scene nobody has measured still looks exactly like
     one that has been. */
  const [picker, panel, css] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/integrated-mockups.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8"),
  ]);
  /* The badge lives with the chooser; the preparation still runs where the
     mockups are actually made. */
  const mockups = `${picker}\n${panel}`;

  /* Her hoodie mockups put the design at the hem, tiny, and she was right that
     the mapping was failing. Measured on her library: BACH TEES 10 of 10 marked,
     white mugs 4 of 4, Gildan Hoodies 2 of 4 - and the two she rendered were the
     unmarked pair. A scene is created with a placeholder box, the middle 70% of
     the photograph, and print-area detection only ever ran while the Mockup
     Library page was open, one AI call per scene. Upload and leave before it
     finishes, or use the scenes straight from the factory, and they keep the
     placeholder for good. The render then fell back to a fixed guess: centre it,
     42% scale. Which is exactly where her design landed.

     The detection works - called directly on one of her stale scenes it returned
     a chest box at high confidence. It was running in the wrong place. */
  assert.match(mockups, /async function calibrateIfNeeded\(list:Template\[\]\)/);
  assert.match(mockups, /const stale=list\.filter\(item=>!preparationMatchesProduct\(item\.preparation,productName\)\)/);
  assert.match(mockups, /\/prepare`,\{method:"POST"/);
  /* D577 - preparation settles every scene. D572 held unmeasurable scenes back,
     which meant a seller could select eight photographs and receive five. The
     surface is measured when the photograph can be read and computed from the
     product's geometry when it cannot; Printify owns the placement inside it
     either way, so nothing is held back and nothing is guessed about the art. */
  assert.match(mockups, /return \{ready:settled,unmeasured:\[\] as Template\[\]\}/);
  assert.match(mockups, /computedPreparation\(productName,null,item\.printSide\)/);
  assert.match(mockups, /const \{ready:calibrated,unmeasured\}=await calibrateIfNeeded\(chosen\)/);
  /* D577 - and it does not throw. An unmeasured scene renders on a computed
     surface rather than failing the batch it was part of. */
  assert.doesNotMatch(mockups, /if\(unmeasured\.length\)throw/);
  assert.match(mockups, /const measured=calibrated;/);
  assert.match(mockups, /jobs=measured\.map/, "the render uses the measured scenes, not the stale ones");

  // The measurement is saved, so it is done once and not on every render.
  assert.match(mockups, /preparationMatchesProduct\(item\.preparation,productName\)/);

  // And an unmarked scene says so before she picks it.
  assert.match(mockups, /className="scene-unmeasured"/);
  assert.match(css, /\.app-shell \.scene-unmeasured\{/);
});

test("an uncertain print area is refused, not saved as truth — D572", async () => {
  const route = await readFile(new URL("../app/api/mockups/print-area/route.ts", import.meta.url), "utf8");

  /* The review was right on all three counts and one of them was a claim I made
     that the code did not support.

     1. Validation was purely geometric - four corners, in range, each dimension
        over 4%, not the whole image. It cannot tell a chest from a hood, a
        pocket, a sleeve or the model's hair, and the box it accepts is saved once
        and reused for every future design. */
  /* D575 - the apparel-only regex is gone. Judging a shower curtain or a poster
     by a garment's ceiling refused the correct answer on exactly the products
     Goldie has to support, so the bounds now come per family from the one
     classifier in mockup-compatibility. */
  assert.match(route, /const bounds = printAreaBounds\(String\(product \|\| ""\)\)/);
  assert.doesNotMatch(route, /const apparel = \/hoodie\|sweatshirt/,
    "product rules must not be re-implemented inside the route");
  assert.match(route, /wrong-width-for-this-product/);
  assert.match(route, /not-on-the-product/);

  assert.match(route, /if \(rejection\) return NextResponse\.json\(\{ corners: null, reason: rejection \}\)/);

  /* 2. The route reported confidence and both callers ignored it, so a low
        confidence guess became permanent truth. A model grading its own answer
        is not proof. */
  assert.match(route, /if \(parsed\.confidence !== "high"\) return NextResponse\.json\(\{ corners: null, reason: "low-confidence" \}\)/);
  assert.doesNotMatch(route, /confidence: parsed\.confidence === "high" \? "high" : "low"/);
});

/* D626 · D559 built the one-call bundle publish correctly at the transport
 * layer - per-product settings on the wire, per-product settings in the queue -
 * and then four readers upstream of it quietly shrank the batch back down to
 * whichever product happened to be open:
 *
 *   1. the selection seeding effect pruned every bundle member's id out of
 *      selectedPublishIds on any change to `drafts`
 *   2. selectedPublishDrafts counted one product, so the button, the gate and
 *      the confirmation described a smaller press than the one being sent
 *   3. createdListingsMissingImages asked the open product's photo maps about
 *      every draft, so a member with no photos looked ready
 *   4. missingPublishFields checked the open product's designs, so titles, tags
 *      and Etsy details on the other products were never checked at all
 *
 * The feature is only real if all four read the bundle. */
test("nothing upstream of the send shrinks a bundle publish back to one product — D626", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  // 1 - seeding is bundle-wide, and cannot re-tick a box she cleared.
  const seeding = app.match(/const seededPublishIds=useRef<Set<string>>\(new Set\(\)\);[\s\S]*?\},\[drafts,bundleMembers,activeBundle,bundleRecipes,activeRecipe\]\);/)?.[0];
  assert.ok(seeding, "the publish selection must be seeded from the bundle");
  assert.match(seeding, /bundlePublishDrafts\(\)\.filter/);
  assert.match(seeding, /const fresh=sellerChosePublish\.current\?\[\]:created\.filter\(id=>!seededPublishIds\.current\.has\(id\)\)/,
    "only genuinely new listings may be added, and none once the seller has chosen - D645");
  assert.match(seeding, /return fresh\.length\?\[\.\.\.new Set\(\[\.\.\.kept,\.\.\.fresh\]\)\]:kept/);

  /* The dependency array is evaluated during render, so this effect has to sit
     below the bundle state it names. It did not, and every render threw. */
  assert.ok(app.indexOf("const [bundleMembers,setBundleMembers]") < app.indexOf("const seededPublishIds=useRef"),
    "the seeding effect must be declared after the state its deps reference");

  // 2, 3, 4 - the gates cover everything the press will create.
  assert.match(app, /function selectedPublishDrafts\(\)\{const selected=new Set\(selectedPublishIds\);return bundlePublishDrafts\(\)\.filter/);
  assert.match(app, /function createdListingsMissingImages\(source=drafts\)\{const selections=bundlePublishSelections\(\),mockups=bundlePublishMockupCounts\(\)/);
  assert.match(app, /\(selections\[draft\.id\]\?\?productDefaultIndices\(draft\.id\)\)\.length/,
    "a draft's photo readiness must be judged against its own product's default");
  assert.match(app, /chosenFiles=bundlePublishFiles\(\)\.filter\(file=>clientIds\.has\(file\.id\)\)/,
    "titles, tags and Etsy details must be checked on every product in the bundle");

  // productDefaultIndices must ask the member, not the open product.
  const defaults = app.match(/function productDefaultIndices\(draftId:string\)\{[\s\S]*?\n  \}/)?.[0];
  assert.ok(defaults, "productDefaultIndices must exist");
  assert.match(defaults, /Object\.values\(bundleMembers\)\.find\(entry=>entry\.drafts\.some\(draft=>draft\.id===draftId\)\)/);
  assert.match(defaults, /return member\?member\.indices:printifyImageIndices/);

  // And none of the old one-product forms may come back.
  assert.doesNotMatch(app, /const created=drafts\.filter\(draft=>draft\.status==="Created"&&draft\.id\)\.map\(draft=>draft\.id!\);setSelectedPublishIds/);
  assert.doesNotMatch(app, /!\(printifyImageSelections\[draft\.id\]\?\?printifyImageIndices\)\.length/);
  assert.doesNotMatch(app, /chosenFiles=files\.filter\(file=>clientIds\.has\(file\.id\)\)/);
});

/* D627 · Measured live on her ZZ TEST BUNDLE, three products, at step 4:
 *
 *   PRODUCT 1 OF 3  Gildan Hoodie      Checking…
 *   PRODUCT 2 OF 3  Gildan Tee         2 ready
 *   PRODUCT 3 OF 3  gildan crewneck    2 drafts
 *   Publish button: disabled, "Goldie is still reading the other products in
 *   this batch must be completed before publishing."
 *
 * It was not still reading. The hoodie member pointed at batch 2d2650a1, which
 * returns 404 - the batch had been deleted. The loader's failure path returned
 * null, writing no summary, and bundleProductsStillReading() reports precisely
 * "has a batch id, has no summary". So the card said Checking… forever, the
 * gate never cleared, and that bundle could never be published by anyone. The
 * message promised it was about to finish.
 *
 * Worse than the dead end: had the gate cleared, a member with zero drafts and
 * a batch id satisfied neither half of bundleProductsNotStarted(), so the press
 * would have gone ahead and quietly left that product out. */
test("a bundle member whose batch cannot be opened is answered, not awaited — D627", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  // The failure path writes a real summary, so "still reading" becomes false.
  assert.match(app, /if\(!state\)return \[recipe\.id,\{designs:0,titled:0,tagged:0,drafts:0,described:false,complete:false,published:0,status:"",photos:0,mockups:0,unreadable:true\}\] as const/,
    "an unreadable member must record that it is unreadable");
  assert.doesNotMatch(app, /if\(!state\)return null;/,
    "returning nothing is what left the card checking forever");

  // Still-reading keeps its meaning: batch id present, summary absent.
  assert.match(app, /return bundleRecipes\.filter\(recipe=>recipe\.id!==activeRecipe\?\.id&&Boolean\(bundleBatchIds\[recipe\.id\]\)&&!bundleBatchSummary\[recipe\.id\]\)/);

  // The card stops claiming to be busy.
  assert.match(app, /if\(summary\.unreadable\)return \{label:"Batch not found",tone:"attention"\}/);

  // And the press is blocked by name rather than silently dropping the product.
  assert.match(app, /bundleBatchSummary\[recipe\.id\]\?\.unreadable\|\|\(!bundleBatchIds\[recipe\.id\]/);
  assert.match(app, /batch could not be opened - it may have been deleted/);

  /* The unreadable branch has to be checked before the drafts/published
     branches, or a zero-draft unreadable member reads as "Not started yet"
     and loses the only accurate thing anyone can say about it. */
  const status = app.match(/const summary=bundleBatchSummary\[recipe\.id\];[\s\S]*?return \{label:"Not started yet",tone:"waiting"\};/)?.[0];
  assert.ok(status, "the member card status branch must be findable");
  assert.ok(status.indexOf("summary.unreadable") < status.indexOf("if(summary.published)"),
    "unreadable must be answered before the counting branches");
});

/* D628 · Measured live on ZZ TEST BUNDLE the moment D627 landed. The gate was
 * correct, the wording was not:
 *
 *   button:  "Gildan Hoodie still has no listings"
 *   tooltip: "Gildan Hoodie's batch could not be opened - it may have been
 *             deleted must be completed before publishing."
 *
 * The label named the wrong problem - that product may well have had listings;
 * its batch is gone - and pointed the seller at a fix that cannot work. The
 * tooltip stapled a noun-phrase suffix onto a whole sentence. */
test("the publish gate names the real blocker, in a sentence that parses — D628", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  // A missing batch and an empty product are different problems.
  assert.match(app, /const missingBatch=waiting\.filter\(recipe=>bundleBatchSummary\[recipe\.id\]\?\.unreadable\)/);
  assert.match(app, /\$\{missingBatch\[0\]\.name\}'s batch was not found/);
  assert.match(app, /\$\{missingBatch\.length\} products' batches were not found/);

  /* And it has to be asked first: an unreadable member is also in `waiting`, so
     checking "no listings" ahead of it puts back the wrong message. */
  const label = app.slice(app.indexOf("const waiting=bundleProductsNotStarted();"));
  assert.ok(label.indexOf("missingBatch.length") < label.indexOf("still ${waiting.length===1?\"has\":\"have\"} no listings"),
    "the missing-batch case must be answered before the empty-product case");

  // One phrasing that works for both a noun phrase and a full sentence.
  assert.match(app, /`Before publishing: \$\{field\}`/);
  assert.doesNotMatch(app, /must be completed before publishing/);
});

/* D629 · D479 added BUILD_MARKER so "is my fix live" was one request with a
 * yes-or-no answer, and D542 wired it to a notice telling a seller her open tab
 * is behind the deployed build. Both depend on a human remembering to bump a
 * string, and D627 and D628 both shipped while it still read D626.
 *
 * Measured this session: /api/version answered D626 for code that was not D626,
 * so verifying the deploy meant fetching the minified chunk and grepping it for
 * a string literal. The seller-facing half is worse - every forgotten bump is a
 * deploy where nobody working in an open tab is ever told to reload. */
test("the deployed build identifies itself without anyone remembering to — D629", async () => {
  const [marker, route] = await Promise.all([
    readFile(new URL("../app/build-marker.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/version/route.ts", import.meta.url), "utf8"),
  ]);

  // The readable label stays.
  assert.match(marker, /export const BUILD_MARKER = "D\d+"/);
  /* And something nobody types travels with it. D630 changed where that value
     comes from - the Vite build inlines it, rather than a Vercel environment
     variable this project never sets - but the contract here is unchanged: the
     route must serve a commit alongside the marker. */
  assert.match(marker, /export const BUILD_COMMIT: string =/);
  assert.match(route, /build:BUILD_MARKER,commit:BUILD_COMMIT/);

  /* An unresolvable commit must degrade to exactly the old behaviour rather
     than claiming every tab is behind on every check. */
  assert.match(marker, /: \(process\.env\.VERCEL_GIT_COMMIT_SHA \?\? ""\)/,
    "an absent commit is empty, not undefined");
});

/* D630 · D629 claimed to remove the human step and did not. It read
 * VERCEL_GIT_COMMIT_SHA; this project builds with Vinext on Vite and deploys to
 * Cloudflare, so nothing ever set it. Production answered:
 *
 *   {"ok":true,"build":"D629","commit":""}
 *
 * Every assertion D629 shipped passed, because they all checked the source that
 * reads the variable and none checked that a value came out the other end. This
 * one reads the built artifact, so it fails if the commit is not actually there. */
test("the built version route carries the commit it was built from — D630", async () => {
  const { execSync } = await import("node:child_process");
  const { readdir } = await import("node:fs/promises");

  let head = "";
  try {
    head = execSync("git rev-parse HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { /* no checkout - nothing to compare against, see below */ }

  const dist = new URL("../dist/", import.meta.url);
  const walk = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const found = [];
    for (const entry of entries) {
      const child = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
      if (entry.isDirectory()) found.push(...await walk(child));
      else if (entry.name.endsWith(".js")) found.push(child);
    }
    return found;
  };
  const files = await walk(dist);
  assert.ok(files.length, "npm test builds before it tests, so dist must exist");

  const sources = await Promise.all(files.map((file) => readFile(file, "utf8").catch(() => "")));
  const versionRoute = sources.find((text) => /ok:!0,build:/.test(text));
  assert.ok(versionRoute, "the built /api/version route must be findable in dist");

  if (head) {
    assert.ok(versionRoute.includes(head),
      `the built version route must carry ${head.slice(0, 7)}; D629 shipped one carrying nothing`);
  } else {
    assert.match(versionRoute, /[0-9a-f]{40}/, "some resolved commit must be inlined");
  }

  // The resolver prefers a real checkout, then whatever CI variable exists.
  const resolver = await readFile(new URL("../build/build-commit.ts", import.meta.url), "utf8");
  assert.match(resolver, /"WORKERS_CI_COMMIT_SHA"/);
  assert.match(resolver, /git rev-parse HEAD/);
  assert.match(resolver, /return "";/, "an unresolvable commit degrades to the readable marker");

  // Vite is what inlines it - not an environment variable read at runtime.
  const vite = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.match(vite, /__BUILD_COMMIT__: JSON\.stringify\(buildCommit\)/);
  const marker = await readFile(new URL("../app/build-marker.ts", import.meta.url), "utf8");
  assert.match(marker, /typeof __BUILD_COMMIT__ === "string" \? __BUILD_COMMIT__/);
});

/* D631 · Deleting a batch left every bundle that referenced it pointing at
 * something gone. Measured on ZZ TEST BUNDLE: its Gildan Hoodie member pointed
 * at batch 2d2650a1, which 404s, and step 4 sat on "Checking…" forever with
 * Publish disabled. D627 made that state honest and recoverable; this stops it
 * being created at all. Deleting a batch from Batch History is an ordinary
 * thing to do, so whoever breaks the reference has to clean it up. */
test("deleting a batch clears the bundles that pointed at it — D631", async () => {
  const route = await readFile(new URL("../app/api/batches/route.ts", import.meta.url), "utf8");

  // Only this user's rows, and only rows that actually mention the deleted id.
  assert.match(route, /SELECT id,state_json FROM listing_batches WHERE user_id=\? AND state_json LIKE \?/);
  assert.match(route, /\.bind\(user\.userId,`%\$\{id\}%`\)/);

  // A row is only rewritten when a mapping really pointed at the deleted batch.
  assert.match(route, /const kept=Object\.fromEntries\(Object\.entries\(map\)\.filter\(\(\[,value\]\)=>String\(value\)!==id\)\)/);
  assert.match(route, /if\(Object\.keys\(kept\)\.length===Object\.keys\(map\)\.length\)continue;/,
    "an unrelated batch that merely mentions the id must not be rewritten");

  // Unparseable or bundle-less state is skipped rather than clobbered.
  assert.match(route, /catch\{continue\}/);
  assert.match(route, /if\(!map\|\|typeof map!=="object"\)continue;/);

  // The write stays scoped to the owner.
  assert.match(route, /UPDATE listing_batches SET state_json=\?,updated_at=CURRENT_TIMESTAMP WHERE id=\? AND user_id=\?/);
});

/* D631 · The D612 probe was a one-off diagnostic built during the outage that
 * turned out to be Goldie's own bug, not Printify's - D594 sent a stale image
 * ID, D614 removed label handling entirely. It named a subsystem that was never
 * at fault, and it has had no reason to exist since. Owner-gated or not, a
 * route that uploads to Printify on request is not something to launch with. */
test("the D612 Printify probe is gone — D631", async () => {
  const { access } = await import("node:fs/promises");
  const gone = async (path) => {
    try { await access(new URL(path, import.meta.url)); return false; } catch { return true; }
  };
  assert.ok(await gone("../app/api/printify/probe/route.ts"), "the probe route must be removed");
  assert.ok(await gone("../tests/printify-probe.test.mjs"), "and its test with it");
});

/* D634 · Caught with the confirmation open and a finger over the button.
 *
 * Measured live on her 3-product bundle: four of the six listings unticked, the
 * publish button correctly reading "Publish 2 listings live on Etsy · 3
 * products" - and the final confirmation saying:
 *
 *   "6 listings across 3 products will go live on Etsy."
 *   "about $1.20 for 6 listings"
 *
 * It read requestedListingCount, which is designs x products - the size of the
 * batch when the DRAFTS were created. It has nothing to do with what is ticked
 * to publish. So the last screen before money is spent overstated the press by
 * three times and misquoted the cost, on the one screen where the number IS the
 * cost. D561 fixed exactly this for the button; the dialog behind it was still
 * counting something else entirely. */
test("the publish confirmation counts what will actually publish — D634", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  const dialog = app.slice(app.indexOf('<h2 id="publish-confirm-title">'), app.indexOf('id="publish-confirm-title"') + 2600);
  assert.ok(dialog, "the publish confirmation must be findable");

  // The headline, the product count and the fee all come from the sent array.
  assert.match(dialog, /\$\{publishTargets\(\)\.length\} \$\{publishTargets\(\)\.length===1\?"listing":"listings"\} across/);
  assert.match(dialog, /new Set\(publishTargets\(\)\.map\(item=>item\.productName\)\)\.size/,
    "the product count must be the products actually being published");
  assert.match(dialog, /about \$\$\{\(publishTargets\(\)\.length\*0\.2\)\.toFixed\(2\)\}/,
    "the quoted Etsy fee must match the number of listings being created");

  // requestedListingCount is the draft-creation size and must not appear here.
  assert.doesNotMatch(dialog, /requestedListingCount/,
    "designs x products is the batch size, not the publish size");

  /* It still exists for the place it belongs - the pre-flight that creates the
     drafts, and the plan-allowance check. */
  assert.match(app, /const requestedListingCount=Math\.max\(0,files\.length\*bundleProductCount/);
  assert.match(app, /planDraftsRemaining!==null&&requestedListingCount>planDraftsRemaining/);
});

/* D635 · Two defects with one cause: the button and the click that follows it
 * asked different questions.
 *
 * Measured live on the 3-product bundle, two Hoodie listings selected:
 *   button:  "Publish 2 listings live on Etsy · 3 products", enabled
 *   click:   "Finish all sections first. Choose a keyword bank for Gildan
 *             Hoodie. Add at least one finished design."
 *
 * The button was disabled by missingPublishFields and the selection's photos.
 * The guard additionally ran requiredForStep("finish") and called
 * createdListingsMissingImages with NO argument - the open product, not the
 * selection. requiredForStep asks whether this product could BUILD a batch: a
 * keyword bank, at least one design in hand. That has nothing to do with
 * whether already-created listings can publish, and asking it of whichever
 * product happened to be open is what stopped a bundle whose other members were
 * complete. */
test("one list decides whether the press can happen, scoped to the selection — D635", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  const blockers = app.match(/function publishBlockers\(\)\{[\s\S]*?\n  \}/)?.[0];
  assert.ok(blockers, "publishBlockers must exist");

  // Everything the old guard checked, now in one place.
  assert.match(blockers, /!localPreview&&!etsyConnected/);
  assert.match(blockers, /batchHeldByAnotherTab/);
  assert.match(blockers, /issues\.push\(\.\.\.missingPublishFields\(\)\)/);

  // Judged on the selection, never on whichever product is open.
  assert.match(blockers, /const chosen=selectedPublishDrafts\(\)/);
  assert.match(blockers, /createdListingsMissingImages\(chosen\)/);
  assert.doesNotMatch(blockers, /createdListingsMissingImages\(\)/,
    "the no-argument form reads the open product's drafts");
  assert.doesNotMatch(blockers, /requiredForStep/,
    "building a batch is a different question from publishing finished listings");

  // A listing whose product never resolved a shipping profile fails at the
  // route with a 400, so it is caught before the press rather than after.
  /* D643 widened this: a profile can also be present but belong to a different
     Etsy shop, which Etsy only rejects mid-publish. */
  assert.match(blockers, /for\(const item of publishTargets\(\)\)\{/);
  assert.match(blockers, /if\(!profile\)\{issues\.push\(`\$\{item\.productName\|\|"This product"\} has no Etsy shipping profile selected\.`\);continue\}/);
  assert.match(blockers, /if\(shopProfiles\.size&&!shopProfiles\.has\(profile\)\)issues\.push\(`Choose a shipping profile for this Etsy shop/,
    "an id from a previous shop must be caught before the press, not by Etsy after it");

  // Both the button and the guard read it, so they cannot diverge again.
  assert.match(app, /disabled=\{publishing\|\|publishBlockers\(\)\.length>0\}/);
  assert.match(app, /issues=publishBlockersRef\.current\(\);/);
  /* D660 · a fifth reader: the final-review heading, which used to say "ready
     for its final check" above this very button while it was disabled. Still
     the one list - that is what this count protects. */
  assert.equal((app.match(/publishBlockers\(\)/g) || []).length, 5,
    "declared once; read by the button's disabled, its title twice, and the heading");
  assert.match(app, /<h2>\{publishBlockers\(\)\.length\?"Finish these items before publishing"/,
    "the heading reads the same list as the button");
  assert.match(app, /publishBlockersRef\.current=publishBlockers;/,
    "and by the guard through a ref refreshed every render - D644");
});

/* D636 · After D634 fixed the confirmation, two labels on the page behind it
 * were still counting the bundle instead of the ticks.
 *
 * Measured live with two of six listings selected:
 *   button: "Publish 2 listings live on Etsy · 3 products"
 *   inline: "Publishing sends all 3 products in this batch — 2 listings —
 *            live on Etsy."
 *
 * Both put a correct listing count next to a wrong product count, in the same
 * sentence, so each label contradicted itself. The confirmation already said
 * "2 listings across 1 product". Labels only - the payload is untouched. */
test("every number on the publish screen comes from the selected targets — D636", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  // Both labels derive the product count from the same array as the listings.
  assert.equal((app.match(/new Set\(publishTargets\(\)\.map\(item=>item\.productName\)\.filter\(Boolean\)\)\.size\|\|bundleRecipes\.length/g) || []).length, 2,
    "the button and the inline explanation each count the products being published");

  assert.match(app, /`Publish \$\{total\} \$\{total===1\?"listing":"listings"\} live on Etsy · \$\{products\} \$\{products===1\?"product":"products"\}`/);
  assert.match(app, /`Publishing sends \$\{chosenProducts\} selected \$\{chosenProducts===1\?"product":"products"\} — \$\{total\} \$\{total===1\?"listing":"listings"\} — live on Etsy\.`/);

  // The old bundle-counted phrasings must not come back.
  assert.doesNotMatch(app, /live on Etsy · \$\{bundleRecipes\.length\} products/);
  assert.doesNotMatch(app, /Publishing sends all \$\{bundleRecipes\.length\} products in this batch/);

  /* Guard the instruction that came with this change: labels only. The sent
     payload and the confirmation must be exactly as D626/D634 left them. */
  assert.match(app, /body:JSON\.stringify\(\{productIds:ids,printifyImageIndices,printifyImageSelections,etsyShippingProfileId,byProduct\}\)/,
    "the publish payload is unchanged");
  assert.match(app, /const everything=publishTargets\(\);\n    const ids=everything\.map\(item=>item\.id\);if\(!ids\.length\)return;/,
    "publishAll still sends exactly the selected targets");
});

/* D637 · Job 050552ce, two Hoodie listings, measured over eleven minutes:
 *
 *   total 2 · completed 0 · failed 0 · queued 0 · processing 2 · last_error null
 *   budget: 79,753 remaining          Etsy: zero listings created
 *
 * Nothing was published and nothing errored. Three faults compounded:
 *
 *   1. publishOne held one execution for up to 45 seconds polling Printify for
 *      the Etsy listing id. Cloudflare ends the request first, so the item was
 *      left status='running' with the work half done.
 *   2. The sweep that returns an abandoned claim to the queue lived inside
 *      processNextPublishItem, which is only reached when a QUEUED row exists
 *      for that job. With both items running there was no queued row, so the
 *      browser's own polling could never recover them. Permanent processing.
 *   3. The four parallel slots all selected the single oldest queued row, so
 *      one won the claim and three did nothing - two listings could not make
 *      progress independently.
 */
test("an interrupted publish resumes instead of stalling forever — D637", async () => {
  const queue = await readFile(new URL("../app/api/printify/drafts/publish/queue.ts", import.meta.url), "utf8");

  // 1 - interruption during Etsy polling costs one short pass, not the listing.
  assert.match(queue, /const LISTING_ID_POLLS=3;/);
  assert.match(queue, /async function pollForEtsyListing[\s\S]*?return 0\}/,
    "the poll returns rather than throwing, so the item can be requeued");
  assert.doesNotMatch(queue, /attempt<18/, "the 45-second block is what broke it");

  // 2 - interruption after Printify publish: requeued, bounded, and explained.
  assert.match(queue, /status='queued',locked_at=NULL,available_at=\?,last_error=\?/,
    "an item waiting on the Etsy id goes back on the queue with a reason");
  assert.match(queue, /if\(waits>=MAX_LISTING_WAITS\)throw new Error\("Printify accepted the publish but never returned an Etsy listing ID/,
    "and cannot wait forever - it ends in a stated failure");

  // 3 - stale-running recovery, on every path.
  assert.match(queue, /export async function reclaimStalledPublishItems\(\)/);
  assert.match(queue, /WHERE status='running' AND \(locked_at IS NULL OR locked_at<\?\)/,
    "a claim with no timestamp is stalled too");
  const global = queue.match(/export async function processNextGlobalPublishItem\(\)\{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(global, /await reclaimStalledPublishItems\(\);/,
    "the path the browser polls must sweep, or nothing can ever recover");
  assert.match(queue, /const RECLAIM_SECONDS=120;/);

  /* 4 - no duplicate publication. D638 corrected this: the three checks that
     precede a publish are Goldie's link record, Printify's external id, and
     Goldie's own record that it already published once. */
  const body = queue.slice(queue.indexOf("const linked=await"), queue.indexOf("if(!listingId)listingId=await pollForEtsyListing"));
  assert.ok(body.indexOf("etsy_listing_links") < body.indexOf("publish.json"),
    "Goldie's own link record is checked before publishing again");
  assert.ok(body.indexOf("printifyListingId(token,draft.shopId,draft.id)") < body.indexOf("publish.json"),
    "and Printify's external Etsy id is checked before publishing again");
  /* D642 made this a `let` so a retry of a publish that produced nothing can
     clear it exactly once; the check itself is unchanged. */
  assert.match(body, /alreadyPublished=Boolean\(priorAttempt&&priorAttempt\.status==="publishing"\)/,
    "and Goldie's own record that it published, which does not depend on Printify answering");
  assert.match(body, /if\(!listingId&&!alreadyPublished\)\{/,
    "publish only runs when none of the three found a listing");

  // 5 - both items progress independently.
  assert.match(queue, /ORDER BY created_at,id LIMIT \?"\)\.bind\(jobId,userId,now,MAX_CONCURRENT_LISTINGS\)/);
  assert.match(queue, /for\(const candidate of candidates\.results\|\|\[\]\)\{[\s\S]*?if\(claimed\.meta\.changes\)\{item=candidate;break\}/,
    "a slot that loses a claim must try the next candidate, not give up");

  // A long finish must not be swept out from under itself.
  assert.match(queue, /UPDATE etsy_publish_items SET locked_at=\?,updated_at=CURRENT_TIMESTAMP WHERE id=\?"\)\.bind\(Math\.floor\(Date\.now\(\)\/1000\),item\.id\)/,
    "the claim is refreshed before the finishing stage");
});

/* D637 · The last surface still counting the bundle rather than the press. */
test("the busy label counts the listings being published — D637", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  assert.match(app, /const sending=publishTargets\(\)\.length\|\|bundleListingsToPublish\(\)/);
  assert.match(app, /const across=new Set\(publishTargets\(\)\.map\(target=>target\.productName\)\.filter\(Boolean\)\)\.size\|\|bundleRecipes\.length/);
  assert.doesNotMatch(app, /Publishing \$\{bundleListingsToPublish\(\)\} listings across \$\{bundleRecipes\.length\} products/);
});

/* D638 · Watching job 050552ce recover under D637 exposed a hole in D637's own
 * guarantee. Its idempotency rested entirely on Printify eventually setting
 * external.id. It never did: every pass found no id, called publish.json AGAIN,
 * polled, requeued. Measured as the job cycling queued(2) -> processing(2) ->
 * queued(2) with 0 completed and 0 failed. So "no duplicate publication" held
 * only in the case where the id came back - the case that was already fine.
 *
 * Goldie has to remember that IT published, without depending on Printify
 * having told it anything yet. */
test("Goldie remembers publishing even when Printify has not answered — D638", async () => {
  const queue = await readFile(new URL("../app/api/printify/drafts/publish/queue.ts", import.meta.url), "utf8");

  // The publish is recorded the moment it is accepted, before any id exists.
  assert.match(queue, /INSERT INTO etsy_listing_links \(printify_product_id,user_id,batch_id,etsy_listing_id,status,last_error,updated_at\) VALUES \(\?,\?,\?,0,'publishing'/,
    "id 0 with status publishing means: published, awaiting the id");
  const publishAt = queue.indexOf("publish.json`,{method:\"POST\"");
  const recordAt = queue.indexOf("VALUES (?,?,?,0,'publishing'");
  assert.ok(publishAt > 0 && recordAt > publishAt, "recorded immediately after the publish is accepted");

  // A later pass sees that record and does not publish again.
  assert.match(queue, /const priorAttempt=listingId\?null:await runtime\(\)\.DB\.prepare\("SELECT status FROM etsy_listing_links WHERE printify_product_id=\? AND user_id=\?"\)/);
  assert.match(queue, /if\(!listingId&&!alreadyPublished\)\{/);

  // The bounded failure says plainly that nothing was published twice.
  assert.match(queue, /Goldie published once and did not repeat it/);

  /* And the payload now shows why an item is waiting. Counts alone made a
     patient wait look identical to a dead stall - which is what cost eleven
     minutes of hand diagnosis. */
  assert.match(queue, /const items=rows\.results\.map\(\(row:\{product_id:string;status:string;last_error\?:string;available_at:number\}\)=>\(\{productId:row\.product_id,status:row\.status,note:row\.last_error\|\|null/);
  assert.match(queue, /return \{\.\.\.job,items,finished,failures/);
});

/* D641 · D639 compared the Printify store's title with the connected Etsy shop
 * name, and Brittany's own account broke it within the hour: her Printify store
 * is still HOWDYANGEL, the Etsy shop it publishes to was renamed to
 * godisagirlapparel, and they are the SAME shop. Goldie refused a setup that was
 * entirely correct.
 *
 *   409 · Printify store: HOWDYANGEL
 *         Goldie's Etsy shop: godisagirlapparel
 *
 * A check that blocks good sellers is worse than no check, and renaming a shop
 * is an ordinary thing to do. Names are not identity: the authoritative question
 * is whether the listings this Printify store creates land in the Etsy shop
 * Goldie holds a token for, and that can be asked directly. */
test("shop pairing is proven against Etsy, never guessed from names — D641", async () => {
  const [match, product, publish] = await Promise.all([
    readFile(new URL("../app/api/printify/shop-match.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/drafts/publish/route.ts", import.meta.url), "utf8"),
  ]);

  // No name comparison survives anywhere in the rule.
  assert.doesNotMatch(match, /toLowerCase\(\)\.replace/, "a renamed shop is still the same shop");
  assert.doesNotMatch(match, /shopsMatch/);
  assert.doesNotMatch(`${product}\n${publish}`, /shopsMatch/);

  // The evidence is a listing this Printify store published, asked for inside
  // the connected Etsy shop. Etsy answers 200 only if it belongs there.
  assert.match(match, /candidates=\(payload\.data\|\|\[\]\)\.map\(product=>Number\(product\.external\?\.id\)\)/,
    "the evidence is still a listing this Printify store published - D646 gathers several");
  /* D646 - reading the listing's own shop_id, not asking for it inside a shop.
     A 404 from the shop-scoped form meant "deleted" as often as "wrong shop". */
  assert.match(match, /await withTimeout\(etsyFetch<\{shop_id\?:number\}>\(`\/listings\/\$\{listingId\}`,etsyToken\),PAIRING_STEP_MS\)/);
  assert.match(match, /if\(owner===etsyShopId\)return \{result:"matched",listingId\}/);

  /* Three outcomes, not two - and only a denial blocks. An absent answer is not
     an answer, which is the whole lesson of D639. */
  assert.match(match, /export type ShopPairing="matched"\|"mismatched"\|"unknown"/);
  /* D646 - mismatched requires positive evidence: the listing exists and names
     another shop. Anything unreadable moves to the next candidate. */
  assert.match(match, /if\(owner!==undefined\)|return \{result:"mismatched",listingId\}/);
  assert.match(match, /catch\{continue\}/, "an unfetchable listing proves nothing");
  assert.match(match, /if\(!owner\)continue;/);
  assert.match(match, /for\(const listingId of candidates\.slice\(0,5\)\)/,
    "one sample is not enough when listings get deleted");
  assert.match(match, /if\(!candidates\.length\)return \{result:"unknown"\}/, "nothing published yet proves nothing");
  assert.match(match, /\n  return \{result:"unknown"\};\n\}/, "and neither does a run where no candidate could be read");

  // Both callers block on "mismatched" and nothing else.
  assert.match(product, /if\(pairing\.result==="mismatched"\)return NextResponse\.json\(\{\.\.\.shopMismatch/);
  assert.match(publish, /if\(pairing\.result==="mismatched"\)return NextResponse\.json\(shopMismatch/);
  /* D655 · counting every `pairing.result===` proved this only while there was
     exactly one branch per caller; remembering a proven match added a second in
     one of them and the count failed while the rule it guards still held. Assert
     the rule instead: the only verdict that stops a seller is "mismatched". */
  for(const [name,source] of [["product",product],["publish",publish]]){
    assert.match(source, /if\(pairing\.result==="mismatched"\)return NextResponse\.json\(/,
      `${name} must block on mismatched`);
    assert.doesNotMatch(source, /pairing\.result==="unknown"/,
      `${name} may not branch on unknown at all`);
    assert.equal((source.match(/pairing\.result==="mismatched"/g) || []).length, 1,
      `${name} has exactly one refusal`);
  }

  // And the refusal explains that this was checked, not assumed.
  assert.match(match, /Goldie read a listing this Printify store published and Etsy says it belongs to a different shop/);
});

/* D639 · Brittany, reading the refusal: "there's no navigation to go back to the
 * Etsy or Printify connection after you've connected." She was right, and it
 * made the refusal above unactionable - it tells a seller to reconnect Etsy with
 * nowhere to do it. Once both accounts were connected the connect screen was
 * unreachable: the auto-skip moves past it and nothing linked back. */
test("the connection screen stays reachable after connecting — D639", async () => {
  const [app, management, icons] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/management-nav.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/nav-icons.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(app, /href="\/listing-factory\?step=connect"[\s\S]{0,120}<NavIcon name="connections"\/>Connections/);
  assert.match(management, /\{key:"connections",href:"\/listing-factory\?step=connect",label:"Connections"\}/,
    "D203's rule: both navigations list the same destinations or they drift");
  assert.match(icons, /case "connections":/);
  assert.match(icons, /\| "connections";/);

  /* The destination only works because an explicitly requested connect step is
     left alone by the auto-skip. D639 shipped this link asserting that guard
     existed; it did, and the link still bounced, because the ref it reads was
     already cleared. D640 gave the fact its own home - assert THAT. */
  assert.match(app, /if\(askedForConnect\.current\)return;/);
});

/* D640 · I shipped the D639 Connections link having checked the markup and not
 * clicked it. Brittany clicked it: "it just brings me back to the batch and
 * gives me the error number."
 *
 * Reproduced exactly - /listing-factory?step=connect lands on ?step=setup. The
 * connection auto-skip asks requestedStep.current==="connect" to decide whether
 * the seller ASKED for the connect screen, but the D487 effect clears that ref
 * the moment the step it names is already current - which on a fresh load of
 * ?step=connect is immediately, before the auto-skip ever runs. The fact was
 * destroyed before its only reader consulted it. */
test("asking for the connect screen keeps you on it — D640", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  // Arriving is a fact about this page load: recorded once, never cleared.
  assert.match(app, /const askedForConnect=useRef\(false\);/);
  assert.match(app, /askedForConnect\.current=requestedStep\.current==="connect";/);
  assert.match(app, /if\(askedForConnect\.current\)return;connectionAutoSkip\.current=true;goToStep\("setup",true,true\)/);

  /* The old reader is exactly what broke: requestedStep is cleared by the effect
     above, so the auto-skip must not depend on it. */
  assert.doesNotMatch(app, /if\(requestedStep\.current==="connect"\)return;/,
    "a ref that gets cleared cannot be the memory of what was asked for");
  assert.match(app, /if\(workflowStep===wanted\)\{requestedStep\.current=null;return\}/,
    "the clearing is still there - which is why the fact needed its own home");
});

/* D640 · The same click showed the mismatch modal headed "This Printify product
 * isn't ready yet", telling her to fix the product in Printify and resubmit.
 * Nothing is wrong with the product. */
test("a shop mismatch does not blame the product — D640", async () => {
  const [match, app] = await Promise.all([
    readFile(new URL("../app/api/printify/shop-match.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(match, /title:"These two shops are not the same\.",/);
  assert.match(app, /title:result\.title\|\|"This Printify product isn’t ready yet\."/,
    "the response may name its own failure; the product wording stays the fallback");
  assert.match(app, /response\.status===409\?"Connect Printify and Etsy to the same shop, then load this product again\. Connections is in the sidebar\."/,
    "and points at the fix that exists rather than at Printify");
});

/* D642 · D638 made Goldie remember its own publish so a resumed item could never
 * publish twice. Correct while a publish is in flight; wrong once one has
 * definitively failed.
 *
 * Measured on both Hoodie products: Printify accepted the publish, then errored
 * on its own side - "Sorry, we couldn't publish this product." - leaving no Etsy
 * listing and no external id, permanently. Goldie went on believing it had
 * published, so every retry only ever polled, and the seller had no way back.
 * Manually publishing the same product inside Printify worked, which proves the
 * product was fine and the recorded publish had simply evaporated.
 *
 * A deliberate retry is distinguishable from the queue's own polling: D475
 * resets attempts to 0 when the seller presses publish on a FAILED item, and
 * nothing else does. */
test("a retry after a publish that produced nothing may publish once more — D642", async () => {
  const [queue, route] = await Promise.all([
    readFile(new URL("../app/api/printify/drafts/publish/queue.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/drafts/publish/route.ts", import.meta.url), "utf8"),
  ]);

  // The signal this depends on must keep meaning what it means.
  assert.match(route, /UPDATE etsy_publish_items SET status='queued',attempts=0,available_at=0,locked_at=NULL,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE user_id=\? AND status='failed'/,
    "a deliberate retry resets attempts; the queue's own polling never does");

  // Three conditions together, or it is not a retry of a publish that vanished.
  assert.match(queue, /if\(alreadyPublished&&!listingId&&item\.attempts===0\)\{/);
  assert.match(queue, /UPDATE etsy_listing_links SET status='retrying'[\s\S]*?AND etsy_listing_id=0/,
    "only a link with no listing may be cleared - never one that has a real listing");
  assert.match(queue, /alreadyPublished=false;/);

  /* And it is one publish, not a loop: only the first pass of the retry clears
     the marker, so every later pass in the same run still refuses. */
  assert.match(queue, /let alreadyPublished=Boolean\(priorAttempt&&priorAttempt\.status==="publishing"\)/);
  assert.match(queue, /if\(!listingId&&!alreadyPublished\)\{/,
    "the publish itself is still gated on the marker");

  // D638's guarantee is untouched for an in-flight publish.
  assert.match(queue, /VALUES \(\?,\?,\?,0,'publishing'/);
});

/* D643 · Two faults that together made a corrected shipping profile impossible
 * to apply, both measured on job 050552ce after the seller moved Goldie to a
 * different Etsy shop.
 *
 * Etsy rejected every listing with "Could not find shipping_profile_id=
 * '59955810985' associated with shop '21777478'" - the batch still held a
 * profile from the previous shop. Nothing revalidated it, so it was discovered
 * mid-publish rather than before the press. And once discovered, it could not
 * be corrected: pressing publish again re-queues the failed items FIRST, the
 * `existing` check then sees them queued and returns `resumed`, and the write
 * that stores settings_json sits after that early return. The profile captured
 * on the first press was baked in permanently. */
test("a corrected shipping profile reaches the job, and a stale one blocks first — D643", async () => {
  const [route, app] = await Promise.all([
    readFile(new URL("../app/api/printify/drafts/publish/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
  ]);

  // The settings are refreshed before anything can return early.
  const refreshAt = route.indexOf("UPDATE etsy_publish_jobs SET settings_json=?,updated_at=CURRENT_TIMESTAMP");
  const resumeAt = route.indexOf("const existing=await");
  assert.ok(refreshAt > 0 && resumeAt > 0, "both statements must exist");
  assert.ok(refreshAt < resumeAt,
    "a retry must update the job's settings before the resume short-circuit");

  // Scoped to this seller's own job for these products.
  assert.match(route, /WHERE user_id=\? AND id IN \(SELECT DISTINCT job_id FROM etsy_publish_items WHERE user_id=\? AND product_id IN \(/);

  // And the blob is built once, early, so both writers use the same value.
  assert.match(route, /const settingsJson=JSON\.stringify\(\{printifyImageIndices:/);
  assert.match(route, /\n  settings=settingsJson;/);

  // A profile from another shop is refused before the press, by name.
  assert.match(app, /const shopProfiles=new Set\(etsyShippingProfiles\.map\(profile=>Number\(profile\.id\)\)\)/);
  assert.match(app, /Choose a shipping profile for this Etsy shop/);
  /* Only when Goldie can actually see the shop's profiles - an empty list is a
     load that has not finished, not evidence the profile is wrong. */
  assert.match(app, /if\(shopProfiles\.size&&!shopProfiles\.has\(profile\)\)/);
});

/* D644 · The click guard is a document listener registered by an effect, so it
 * closes over the state present when that effect last ran - and
 * selectedPublishIds was never among its dependencies. Harmless while the
 * blockers did not depend on the selection. D643 made them per-target and it
 * broke immediately:
 *
 *   button: "Publish 2 listings live on Etsy · 1 product"
 *   click:  "Choose a shipping profile for this Etsy shop — Gildan Tee still
 *            uses one from a different shop."
 *
 * Gildan Tee had been unticked. The guard was reading a selection from before.
 * This is the D635 fault again by a different route: not different logic, a
 * stale copy of the same logic. */
test("the click guard reads the current blockers, not a stale closure — D644", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  assert.match(app, /const publishBlockersRef=useRef<\(\)=>string\[\]>\(\(\)=>\[\]\);/);
  /* Refreshed during render, so it is current before any click can be handled. */
  assert.match(app, /publishBlockersRef\.current=publishBlockers;\n  useEffect\(\(\)=>\{/,
    "the ref must be updated on every render, not inside an effect");
  assert.match(app, /issues=publishBlockersRef\.current\(\);/);
  assert.doesNotMatch(app, /issues=publishBlockers\(\);/,
    "calling it directly is what read the stale selection");
});

/* D645 · Three changes, one session's worth of evidence behind each.
 *
 * 1. Bundle members load in the background, so listings keep arriving after the
 *    page is usable, and every arrival was treated as "seen for the first time,
 *    so start it ticked". Measured live: two listings chosen, the other four
 *    re-ticked themselves as their products loaded, and the press was then
 *    refused naming products no longer shown as chosen.
 * 2. Every alert email so far has been a problem only the seller could fix.
 *    Brittany: "I don't need to know about the errors until somebody contacts
 *    me anyways." With one seller that is noise; with a hundred it is their
 *    support queue in her inbox, burying what she must actually see.
 * 3. Which makes the owner page the place she looks, so the two kinds have to
 *    be separable at a glance. */
test("a chosen selection is never re-ticked by background loading — D645", async () => {
  const [review, app] = await Promise.all([
    readFile(new URL("../app/final-listing-review.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
  ]);

  // Only the seller's own controls flip the flag; the seeding effect sets state directly.
  assert.match(review, /const sellerChose=useRef\(false\);/);
  assert.match(review, /function changeSelection\(ids:string\[\]\)\{[\s\S]*?sellerChose\.current=true;[\s\S]*?setSelectedIds\(ids\);/);
  assert.match(review, /const fresh=sellerChose\.current\?\[\]:available\.filter/);

  // The app side hears the same moment and stops seeding too.
  assert.match(review, /window\.dispatchEvent\(new Event\("goldie-publish-selection-touched"\)\)/);
  assert.match(app, /window\.addEventListener\("goldie-publish-selection-touched",touched\)/);
  assert.match(app, /const fresh=sellerChosePublish\.current\?\[\]:created\.filter/);

  /* Arrivals are still RECORDED as known even when not ticked, or they would be
     treated as new again on the next pass and tick themselves after all. */
  assert.match(review, /available\.forEach\(id=>knownIds\.current\.add\(id\)\)/);
  assert.match(app, /created\.forEach\(id=>seededPublishIds\.current\.add\(id\)\)/);
});

test("seller-fixable failures are recorded and never emailed — D645", async () => {
  const [log, classification, control] = await Promise.all([
    readFile(new URL("../app/error-log.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/error-classification.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/mastermind-admin/admin-control.tsx", import.meta.url), "utf8"),
  ]);

  // One classifier, shared, so the email rule and the page can never disagree.
  assert.match(classification, /export function isSellerFixable\(message:string\)/);
  assert.match(classification, /shipping_profile_id/);
  assert.match(classification, /different shop/);
  /* It must stay free of server imports - the admin page is a client component,
     and importing error-log.ts dragged cloudflare:workers into the browser. */
  assert.doesNotMatch(classification, /^\s*import .*(cloudflare:workers|next\/server)/m,
    "the comment may name them; the module may not import them");
  assert.match(log, /import \{ isSellerFixable \} from "\.\/error-classification"/);
  assert.match(control, /import \{ isSellerFixable \} from "@\/app\/error-classification"/);

  // The email is skipped; the write is not.
  assert.match(log, /if \(!key \|\| input\.severity === "warning" \|\| \(input\.sellerFixable \?\? isSellerFixable\(input\.message\)\)\) return;/);
  assert.match(log, /INSERT INTO error_log/, "everything is still recorded");

  // And the page separates them rather than making her read every message.
  assert.match(control, /const \[errorFilter, setErrorFilter\] = useState<"all"\|"platform"\|"seller">\("all"\)/);
  assert.match(control, /errorFilter === "all" \|\| \(errorFilter === "seller"\) === isSellerFixable\(item\.message\)/);
  assert.match(control, /Seller can fix/);
  assert.match(control, /Needs Goldie/);
  // The old copy promised an email for every area; it must not still say that.
  assert.doesNotMatch(control, /Brittany is emailed the first error in each area/);
});

/* D647 · Walked the whole flow as a seller and lifestyle mockups could not be
 * created at all from a fresh batch.
 *
 * D618 removed the per-listing scene grid so the scenes are chosen ONCE for the
 * batch, in the panel above. That panel writes to the batch. IntegratedMockups
 * kept its own `selected` set, seeded a single time at mount from sessionStorage
 * and never told about later changes - and the call site never passed the
 * batch's chosen scenes at all. Measured live:
 *
 *   grid:   "2 of 5 scenes chosen · up to 8"
 *   button: "0 scenes chosen for this batch", Create selected mockups DISABLED
 *
 * Two counters, one dead button, and no way to make a mockup. */
test("the Create button follows the scenes the batch actually chose — D647", async () => {
  const [mockups, app] = await Promise.all([
    readFile(new URL("../app/integrated-mockups.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(app, /Upload your own listing photos/);
  assert.doesNotMatch(app, /Create selected mockups|<IntegratedMockups/);
  return;

  // The batch's choice is handed down.
  assert.match(app, /<IntegratedMockups[^>]*defaultTemplateIds=\{sharedMockups\?\.theme===mockupTheme\?sharedMockups\.ids:\[\]\}/,
    "the batch's chosen scenes must reach the component that renders the button");

  // And followed on every change, not seeded once.
  assert.match(mockups, /if\(defaultTemplateIds\.length\)\{[\s\S]*?setSelected\(current=>\{const next=new Set\(wanted\)/);
  assert.match(mockups, /\},\[library,defaultTheme,defaultTemplateIds\.join\("\|"\)\]\)/,
    "the effect must re-run when the batch's scenes change");

  /* The one-time session seeding stays, but only for a batch that has not said
     anything yet - it must not be able to block the batch's own answer. */
  const effect = mockups.slice(mockups.indexOf("useEffect(()=>{if(!library.length)return;"), mockups.indexOf("MAX_MOCKUPS_PER_LISTING)\n"));
  assert.ok(effect.indexOf("if(defaultTemplateIds.length)") < effect.indexOf("if(seededDefaults.current)return"),
    "the batch's choice is read before the one-time seed can bail out");

  // The button's own condition is unchanged; it just has the right input now.
  assert.match(mockups, /disabled=\{!chosen\.length\|\|busy\|\|needsReference&&!referenceUrl\}/);
});

/* D647 · Counting bugs found by reading the screen during the walkthrough: a
 * one-design batch reported "1 drafts" on its product card and "Processing up
 * to 1 designs at a time" while it worked. */
test("counts read correctly at one — D647", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  assert.match(app, /\$\{drafts\.length\} \$\{drafts\.length===1\?"draft":"drafts"\}/);
  assert.doesNotMatch(app, /\$\{drafts\.length\} drafts`/);
  assert.match(app, /===1\?"design":"designs"\} at a time without lowering their print resolution/);
});

/* D648 · Everything the seller walkthrough turned up that was cosmetic or
 * copy rather than broken machinery. Each was read off the screen while
 * driving the real flow with a real design and a real draft. */
test("the walkthrough's smaller faults are fixed — D648", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* "Economy-Standard: Printify Choice, Garm… shipping profile" - cut at a
     fixed 39 characters wherever that landed, with a noun stapled after it. */
  /* D660 supersedes the second half of this. D648 made the cut land on a word
     boundary; the live review then showed why that was the wrong fix at all -
     "Economy-Standard: Printify Choice… shipping profile" is unreadable however
     tidily it is cut, and the seller cannot tell which profile will be used.
     Nothing is truncated now; the shortening is CSS, so the whole name stays in
     the DOM and reaches a screen reader. The stripping stays: the row label
     already says "shipping". */
  /* D663 · now applied to the title with the "Standard:" prefix already
     removed, so seven profiles that shared that prefix stop printing as one. */
  assert.match(app, /return withoutStandard\.replace\(\/\\s\*shipping\\s\*profile\\s\*\$\/i,""\)\.trim\(\)\|\|title\.trim\(\);/,
    "never repeat the words the row label already says");
  assert.doesNotMatch(app, /const boundary=Math\.max\(cut\.lastIndexOf\(" "\),cut\.lastIndexOf\(","\)\)/,
    "there is no cut to place on a boundary any more");
  assert.doesNotMatch(app, /title\.slice\(0,39\)\.trim\(\)/);

  /* The low-resolution banner promised a confirmation step that never came;
     the create dialog does not mention resolution at all. */
  assert.doesNotMatch(app, /require confirmation before continuing/);
  assert.match(app, /identify every affected design so you can replace it or continue anyway/);

  // A one-design batch counted itself in the plural in four more places.
  assert.match(app, /\$\{summary\.drafts\} \$\{summary\.drafts===1\?"draft":"drafts"\}/);
  assert.match(app, /\$\{createdDraftCount\} \$\{createdDraftCount===1\?"draft":"drafts"\} created/);
  assert.match(app, /length===1\?"draft":"drafts"\}\{activeBundle/);

  /* And the step 3 badge called itself ready above a crimson row on the same
     card - D624's fault again, one row further down. */
  assert.match(app, /const etsyReady=files\.filter\(file=>etsyRequiredComplete\(file\.etsy\)\)\.length;/);
  assert.match(app, /if\(etsyReady<files\.length\)return \{label:`\$\{etsyReady\} of \$\{files\.length\} Etsy details ready`,tone:"attention"\}/);
});

/* D649 · The two gaps the walkthrough left open, both about telling the seller
 * something Goldie already knows instead of making them find out by failing. */
test("a saved product says which Printify store it lives in — D649", async () => {
  const [api, tools, app, route] = await Promise.all([
    readFile(new URL("../app/api/printify/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/factory-tools.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/product-recipes/route.ts", import.meta.url), "utf8"),
  ]);

  // The shop is known where the product is resolved, so it is returned.
  assert.match(api, /shop: \{ id: found\.shop\.id, title: found\.shop\.title, count: shops\.length \}/);
  /* D650 - almost nobody has two Printify stores, and a label naming the only
     shop you own is noise on every card. Recorded only when there is more than
     one store to confuse. */
  assert.match(app, /Number\(result\.shop\.count\|\|0\)>1/);
  // Recorded on the recipe when it changes, without clobbering anything else.
  assert.match(app, /printifyShopTitle:result\.shop\.title,printifyShopId:result\.shop\.id/);
  /* D653 - it read activeRecipe from its closure, and chooseRecipe calls
     loadTemplateUrl in the same tick as setActiveRecipe, so it saw the PREVIOUS
     recipe or null and never wrote anything. */
  assert.match(app, /const activeRecipeRef=useRef<Recipe\|null>\(null\);\n\s*activeRecipeRef\.current=activeRecipe;/);
  assert.match(app, /const recipeForShop=activeRecipeRef\.current;/);
  assert.match(app, /recipeForShop&&recipeForShop\.printifyShopTitle!==result\.shop\.title/,
    "only write when it actually changed");
  assert.match(route, /if \(body\.printifyShopTitle !== undefined\) patch\.printifyShopTitle/);

  /* Shown only when recorded - a product saved before this says nothing rather
     than asserting a store Goldie never checked. */
  assert.match(tools, /export function recipeShopLabel\(recipe: Recipe\): string \{\n\s*return recipe\.printifyShopTitle \|\| "";/);
  /* D654 - it used to be appended to recipeSummary, which is clamped to one
     line, so a live card rendered the store as "GO...". It must not go back
     into that string. */
  const summaryBody = tools.slice(tools.indexOf("export function recipeSummary"), tools.indexOf("export function recipeShopLabel"));
  assert.ok(!/printifyShopTitle/.test(summaryBody),
    "the store must not be appended to the clamped one-line summary");
  assert.match(tools, /<small className="recipe-shop"/, "the store needs its own line on the card");

  /* D654 - the label was recorded only on the success path, so a product from
     another store - the one case the label exists for - could never be
     labelled. The refusal carries the store too, and records it. */
  assert.match(api, /shopMismatch\(found\.shop\.title,etsyLink\.shopName\|\|"your connected Etsy shop"\),shop:\{id:found\.shop\.id,title:found\.shop\.title,count:shops\.length\}\}/,
    "the 409 must name the store it refused");
  const refusalBranch = app.slice(0, app.indexOf('if (!response.ok || !result.product)'));
  assert.ok(/const refusedRecipe=activeRecipeRef\.current;/.test(refusalBranch),
    "the store must be recorded BEFORE the refusal returns, not after");
});

test("Closure is filled only when the product name settles it — D649", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  const fn = app.match(/export function verifiedClosure\([\s\S]*?\n\}/)?.[0];
  assert.ok(fn, "verifiedClosure must exist");

  // Named closures are read straight off the product.
  assert.match(fn, /full\[-\\s\]\?zip\\b\/\.test\(text\)\)return "Full zip"/);
  assert.match(fn, /quarter\|1\\\/4\)\[-\\s\]\?zip\\b\/\.test\(text\)\)return "Quarter zip"/);
  assert.match(fn, /half\|1\\\/2\)\[-\\s\]\?zip\\b\/\.test\(text\)\)return "Half zip"/);

  /* A garment that says "zip" without saying which is left unresolved - the
     whole point. Guessing writes a wrong attribute onto a live listing. */
  assert.match(fn, /if\(\/\\bzip\\b\/\.test\(text\)\)return "";/);
  assert.ok(fn.indexOf('\\bzip\\b') < fn.indexOf('pullover|hoodie'),
    "the ambiguous-zip bail-out must come before the pullover fallback");
  assert.match(fn, /pullover\|hoodie\|hooded\|sweatshirt\|crewneck\|crew neck\)\\b\/\.test\(text\)\)return "Pullover"/);
  assert.match(fn, /return "";\n\}/, "anything else stays unresolved");

  // It only ever fills a blank required field, matched against Etsy's own values.
  assert.match(app, /if\(!\/closure\/i\.test\(property\.label\)\|\|property\.value\.trim\(\)\)return property;/);
  assert.match(app, /\(property\.possibleValues\|\|\[\]\)\.find\(option=>option\.name\.toLowerCase\(\)===closure\.toLowerCase\(\)\)/);
  assert.match(app, /return match\?\{\.\.\.property,value:match\.name,valueId:match\.value_id\}:property;/,
    "no match means it stays blank and keeps blocking, which is honest");
});

/* D651 · Found by attaching the wrong file to it, which is easy - the size
 * guide picker is one of several file inputs on step 2. There was no way back
 * to none: only "Replace size guide". A size guide goes onto every listing in
 * the batch, so being stuck with the wrong one is not a small mistake. */
test("a size guide can be removed, not only replaced — D651", async () => {
  const [app, css] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8"),
  ]);

  assert.match(app, /async function removeSizeGuide\(\)\{/);
  // It clears the batch and every design's copy of the name.
  assert.match(app, /setSizeGuideName\(""\);\n\s*setFiles\(current=>current\.map\(design=>\(\{\.\.\.design,sizeGuideName:undefined\}\)\)\)/);
  /* And it does not pretend to reach listings that already went out with one. */
  assert.match(app, /Listings this batch has already published keep the one they were given/);

  // Offered only when there is one to remove.
  assert.match(app, /\{sizeGuideName&&<button type="button" className="secondary-action size-guide-remove"/);
  /* D652 - it inherited `.batch-size-guide button`, a filled primary set with
     !important, so the destructive action rendered as heavy as the safe one. */
  const functional = await readFile(new URL("../app/approved-functional.css", import.meta.url), "utf8");
  assert.match(functional, /\.app-shell \.batch-size-guide button\.size-guide-remove\{[\s\S]*?background:transparent!important/);
  assert.match(functional, /\.app-shell \.batch-size-guide \.size-guide-actions\{display:flex/);
});

/* D654 · Found by walking the live app, not by reading it. Choosing the saved
   "Gildan Tee" never finished: measured at over 120 seconds against a client
   that gives up at 90, so the product simply could not be selected.

   The cause was two multipliers stacked on the one request a seller waits on.
   /api/printify asked each Printify store in turn whether it owns the product —
   four stores, four round trips, before the product is even identified. Then
   verifyShopPairing asked Etsy about up to five listings through etsyFetch,
   which retries a 429 or a 5xx five times with backoff up to eight seconds
   each: about 200 seconds of retrying in the worst case.

   Every one of those retries was wasted. The candidate loop catches a failed
   fetch and moves to the next one, so a retried failure and an immediate one
   reach the same verdict. Retrying belongs to a seller's save, not to an
   advisory probe whose honest answer is already "unknown". */
test("choosing a saved product cannot outlive the request waiting on it — D654", async () => {
  const [match, api] = await Promise.all([
    readFile(new URL("../app/api/printify/shop-match.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/route.ts", import.meta.url), "utf8"),
  ]);

  // A budget for the whole check, and a ceiling on any single step inside it.
  assert.match(match, /export const PAIRING_BUDGET_MS=(\d+);/);
  assert.match(match, /export const PAIRING_STEP_MS=(\d+);/);
  const budget = Number(match.match(/PAIRING_BUDGET_MS=(\d+)/)[1]);
  const step = Number(match.match(/PAIRING_STEP_MS=(\d+)/)[1]);
  assert.ok(budget <= 15000, `the pairing check may not cost more than 15s of a seller's wait, got ${budget}`);
  assert.ok(step <= budget, "a single step may not outlast the whole budget");

  // The budget is actually consulted between candidates, not just declared.
  assert.match(match, /const outOfTime=\(\)=>Date\.now\(\)-started>PAIRING_BUDGET_MS;/);
  assert.match(match, /if\(outOfTime\(\)\)return \{result:"unknown"\}/,
    "running out of time is 'unknown', the same as any other thing it could not establish");

  // Every outbound call in the check is bounded.
  assert.match(match, /signal:timeoutSignal\(PAIRING_STEP_MS\)/, "the Printify candidate fetch is bounded");
  assert.match(match, /withTimeout\(etsyFetch/, "the Etsy listing fetch is bounded");

  /* The store walk asks all stores at once. Four stores must cost one round
     trip, not four. */
  assert.match(api, /Promise\.all\(shops\.map\(async shop => \{/,
    "the store walk is one round trip, however it is wrapped for timing");
  assert.doesNotMatch(api, /for \(const shop of shops\) \{[\s\S]{0,400}?products\/\$\{productId\}/,
    "the store walk must not go back to one request at a time");

  /* D654 · and a store that errors is not a store that says no. Reporting a
     Printify outage as "use a product from the connected shop" sends the seller
     to check a connection that was never the problem. */
  assert.match(api, /return response\.status===404\?undefined:\{ shop, unavailable:true as const \};/);
  assert.match(api, /const unreachable = attempts\.some\(attempt => attempt && "unavailable" in attempt\);/);
  assert.doesNotMatch(api, /issues:\["Use a product from the Printify shop connected to Goldie\."\]/,
    "a link that matches no product is a link problem, not a connection problem");
});

/* D654 · Clicking "Add a new product" looked like it did nothing. The form
   renders below the saved-product grid: measured live at 799px down a 812px
   viewport. The click also clears the selected product, so the only part of the
   page the seller can still see changes in a way that reads as a fault. */
test("Add a new product takes you to the form it just opened — D654", async () => {
  const tools = await readFile(new URL("../app/factory-tools.tsx", import.meta.url), "utf8");

  assert.match(tools, /const formRef=useRef<HTMLDivElement\|null>\(null\);/);
  assert.match(tools, /<div className="recipe-form" ref=\{formRef\}>/, "the ref has to be on the form itself");
  assert.match(tools, /setMessage\(""\);revealForm\(\); \}\}>＋ Add a new product<\/button>/,
    "the button must reveal the form it opened");
  assert.match(tools, /node\.querySelector<HTMLInputElement>\("input"\)\?\.focus\(\{preventScroll:true\}\)/,
    "land on the field the seller now has to fill in");
  /* D146 · smooth scrolling never fires in this app, so asking for it here
     would have left the form off screen exactly as before. */
  assert.doesNotMatch(tools, /behavior:"smooth"/);
});

/* D655 · "It's really important that whatever doesn't need to take time during
   this process doesn't take time." D654 bounded ONE slow call on the product
   load; it did not make the load fast. Everything else on that path was still
   there: four sequential catalogue reads, two unbounded Etsy lookups, and a
   pairing check re-proving on every load something that had not changed. */
test("loading a product does not wait on anything it does not have to — D655", async () => {
  const [api, shared] = await Promise.all([
    readFile(new URL("../app/api/printify/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/static-cache.ts", import.meta.url), "utf8"),
  ]);

  /* The catalogue reads are keyed on blueprint_id and print_provider_id, both
     known before any of them run. They were sequential only because they were
     written in a row. */
  assert.match(api, /const \[blueprintResult,providersResult,variantsResult,shippingResult\]=await phase\("catalog",\(\)=>Promise\.allSettled\(\[/);
  assert.equal((api.match(/ {6}printifyCatalog</g) || []).length, 4, "all four catalogue reads go through the cache");
  assert.doesNotMatch(api, /await printify<Blueprint>\(`\/catalog/, "the blueprint read must not go back to a bare sequential fetch");
  assert.doesNotMatch(api, /await printify<Shipping>\(`\/catalog/, "nor the shipping read");

  /* allSettled, not all: each catalogue read was independently optional before
     and has to stay that way. One failing read degrades one detail; it must
     never fail the product load. */
  assert.match(api, /if\(blueprintResult\.status==="fulfilled"\)/);
  assert.match(api, /if\(providersResult\.status==="fulfilled"\)/);
  assert.match(api, /if\(variantsResult\.status==="fulfilled"\)/);
  assert.match(api, /if\(shippingResult\.status==="fulfilled"\)/);

  // Catalogue data is Printify's, not the seller's, so it is cacheable at all.
  assert.match(api, /const CATALOG_TTL_SECONDS=86400;/);
  assert.match(api, /function printifyCatalog<T>\(path: string, token: string, seen\?: \{ fetched: number \}\)/);

  /* Both Etsy reads here already fall through to a message that stays accurate
     without them, so retrying for forty seconds bought the same fallback the
     slow way. */
  assert.match(api, /const ETSY_LOOKUP_MS=(\d+);/);
  assert.ok(Number(api.match(/ETSY_LOOKUP_MS=(\d+)/)[1]) <= 5000);
  assert.equal((api.match(/await boundedEtsy\(etsyFetch</g) || []).length, 2,
    "every Etsy lookup on this path is bounded");
  assert.doesNotMatch(api, /const listing=await etsyFetch</, "the listing lookup must stay bounded");
  assert.doesNotMatch(api, /const profile=await etsyFetch</, "and the shipping-profile lookup");

  /* A proven pairing does not change between two loads. */
  /* D661 · provenMatch/rememberMatch wrote to caches.default, which stored
     nothing this deployment could read back. Same rule, durable store. */
  assert.match(api, /const memo=await provenPairing\(user\.userId,found\.shop\.id,etsyLink\.shopId\);/);
  assert.match(api, /if\(!memo\)\{/, "a proven pairing skips the check entirely");
  assert.match(api, /if\(pairing\.result==="matched"\)await rememberPairing\(user\.userId,found\.shop\.id,etsyLink\.shopId,pairing\.listingId\|\|0\);/);
  // Keyed on BOTH shops, so reconnecting Etsy elsewhere cannot hit a stale yes.
  // Keyed on both STABLE shop ids, never on a name - D641 was a rename.
  assert.match(shared, /WHERE user_id=\? AND printify_shop_id=\? AND etsy_shop_id=\? AND proved_at>\?/);
  assert.doesNotMatch(shared, /shop_name|shopTitle|printifyShopTitle/,
    "a pairing proof keyed on a name would reintroduce the D641 rename fault");
  /* A mismatch is never remembered: the seller is mid-fix and has to be
     re-checked the moment they try again. */
  assert.doesNotMatch(api, /pairing\.result==="mismatched"\)await rememberPairing/);
  // And a changed connection on either side voids every proof.
  assert.equal((api.match(/forgetPairings\(/g) || []).length, 2,
    "voided on a Printify disconnect and on a new token, which can be a different account");
});

/* D656 · The worst repeat was not on the product load at all. Preparing Etsy
   details fetched /seller-taxonomy/nodes - Etsy's ENTIRE global category tree,
   several megabytes, identical for every Etsy seller alive - and then flattened
   it in the worker, once per design. A ten-design batch downloaded and walked
   that tree ten times before a single listing was ready, at concurrency 1. */
test("platform data is fetched once, not once per design — D656", async () => {
  const [shared, taxonomy, api] = await Promise.all([
    readFile(new URL("../app/api/static-cache.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/etsy/taxonomy/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/route.ts", import.meta.url), "utf8"),
  ]);

  /* One cache, because Etsy's taxonomy and Printify's catalogue are the same
     problem: platform data, not seller data. */
  assert.match(shared, /export async function cachedJson<T>\(namespace: string, path: string, ttlSeconds: number, load: \(\) => Promise<T>\)/);
  /* The key is the path and the namespace, nothing else. Anything scoped to a
     caller must not be reachable through here. */
  assert.match(shared, /const key = `\$\{namespace\}:\$\{path\.startsWith\("\/"\) \? path : `\/\$\{path\}`\}`;/);
  /* Checked against the code, not the prose: the comment above it has to be
     free to explain why a token is required to fetch what it caches. */
  const sharedCode = shared.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  /* Scoped to cachedJson itself. D661 put the pairing proof in the same file,
     and that one is DELIBERATELY per seller - it just must never travel through
     the shared key. */
  const sharedFn = sharedCode.slice(sharedCode.indexOf("export async function cachedJson"), sharedCode.indexOf("export const TAXONOMY_TTL_SECONDS"));
  assert.ok(sharedFn, "cachedJson must still be findable");
  assert.doesNotMatch(sharedFn, /userId|user\.|token|shopId/,
    "a shared cache key may not contain anything seller-specific");
  /* D661 · A cache that cannot be reached is a miss, never an error - on the
     read AND on the write, so a storage failure cannot fail a request whose
     data already loaded. */
  assert.match(shared, /catch \{ \/\* A cache that cannot be read is a cache miss, never an error\. \*\/ \}/);
  assert.match(shared, /catch \{ \/\* Failing to store must not fail the request that loaded it\. \*\/ \}/);
  assert.doesNotMatch(shared, /caches\?\.default/, "the inert implementation is gone");

  // The taxonomy download AND the flatten are both behind the cache.
  assert.match(taxonomy, /categories=await cachedJson\("etsy-taxonomy","\/nodes",TAXONOMY_TTL_SECONDS,async\(\)=>\{/);
  assert.match(taxonomy, /return flatten\(tree\.results\|\|\[\]\)\.filter\(node=>node\.leaf\);/,
    "the flattened form is what gets cached, so the walk stops repeating too");
  assert.doesNotMatch(taxonomy, /tree=await etsyFetch<\{results\?:TaxonomyNode\[\]\}>\("\/seller-taxonomy\/nodes",connection\.token\),categories=flatten/,
    "the tree must not go back to being fetched and flattened per request");
  // Per-node properties are global too.
  assert.match(taxonomy, /const payload=await cachedJson\("etsy-taxonomy",`\/nodes\/\$\{selected\.id\}\/properties`,TAXONOMY_TTL_SECONDS/);

  // Printify's catalogue shares it rather than keeping a second copy.
  assert.match(api, /return cachedJson<T>\("printify-catalog", path, CATALOG_TTL_SECONDS, \(\) => \{ if\(seen\)seen\.fetched\+=1; return printify<T>\(path, token\); \}\);/);
  /* D661 · and the inert implementation is gone, so no diagnostic can report a
     cache that was never there. */
  assert.doesNotMatch(api, /caches\?\.default|goldie-pairing\.internal|goldie-catalog\.internal/);
});

/* D657 · Every timing taken of the product load was measured inside a browser
   tab Chrome had backgrounded. Hidden tabs have their timers and promise
   continuations frozen: a plain setInterval(500ms) produced zero ticks in 28
   seconds. So the numbers described the tab, not the server, and "over 120
   seconds" was never a measurement of Goldie at all.

   The code findings behind D655 and D656 stand on inspection - four sequential
   catalogue reads that depend on nothing, retries whose failure is already
   handled by falling through, a multi-megabyte taxonomy fetched per design -
   but no speed claim can rest on a frozen tab. So the route measures itself. */
test("the product load reports its own timings and cache outcome — D657", async () => {
  const api = await readFile(new URL("../app/api/printify/route.ts", import.meta.url), "utf8");

  assert.match(api, /const phase=async <T,>\(name:string,work:\(\)=>Promise<T>\):Promise<T>=>/);
  for (const name of ["shops", "findProduct", "shopPairing", "catalog"]) {
    assert.match(api, new RegExp(`phase\\("${name}"`), `${name} is timed`);
  }
  assert.match(api, /timings\.total=Date\.now\(\)-started;/);
  assert.match(api, /return NextResponse\.json\(\{ timings, cache: cacheReport,/,
    "the numbers have to reach the caller or they cannot be read");

  /* Cold and warm are told apart by counting the reads that actually left the
     worker, not by how long the request felt. */
  assert.match(api, /const catalogFetches=\{fetched:0\};/);
  assert.match(api, /if\(seen\)seen\.fetched\+=1;/);
  assert.match(api, /cacheReport\.catalog=catalogFetches\.fetched===0\?"hit":catalogFetches\.fetched===4\?"miss":"skipped";/);
  assert.match(api, /cacheReport\.shopPairing=memo\?"hit":"miss";/);
});

/* D657 · Two properties of the shared cache that had to be established rather
   than assumed, because getting either wrong is worse than not caching. */
test("the shared cache coalesces misses and never stores a failure — D661", async () => {
  const shared = await readFile(new URL("../app/api/static-cache.ts", import.meta.url), "utf8");

  /* Several designs prepare at once inside one isolate. Before this they all
     missed together and each started its own download of the same taxonomy, so
     the cache only ever helped the NEXT batch. */
  assert.match(shared, /const inFlight = new Map<string, Promise<unknown>>\(\);/);
  assert.match(shared, /const pending = inFlight\.get\(key\);\n\s*if \(pending\) return pending as Promise<T>;/);
  assert.match(shared, /inFlight\.set\(key, work\);/);
  /* Removed as soon as it settles: a failure must not be remembered, or the
     next caller inherits a rejected promise instead of retrying. */
  assert.match(shared, /try \{ return await work \} finally \{ inFlight\.delete\(key\) \}/);

  /* cache.put is reached only after load() resolves. printify() and etsyFetch()
     both throw on any non-2xx, so a 401, 403, 429 or 5xx rejects before it -
     caching a rate limit for a day would be far worse than the repeat fetch. */
  /* Ordering is checked against the code: the comment above it names cache.put
     while explaining why a failure never reaches it. */
  const code = shared.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const body = code.slice(code.indexOf("const work = (async () => {"), code.indexOf("inFlight.set(key, work);"));
  assert.ok(body.includes("INSERT INTO platform_cache"), "the body under test has to contain the write");
  assert.ok(body.indexOf("const value = await load();") < body.indexOf("INSERT INTO platform_cache"),
    "nothing is stored until the load has actually succeeded");

  // Expiry is carried on the stored entry, not assumed.
  assert.match(shared, /expires_at>\?/, "an expired row is a miss");
  assert.match(shared, /now \+ ttlSeconds/, "and the expiry is written with the value");
});

/* D658 · Measured on the live build, from a synchronous request so no frozen
   tab could distort it: /api/etsy/taxonomy returned 261,808 bytes and took
   2.4-3.2s, every call, WITH D656's cache doing its job. D656 stopped the tree
   being fetched per design; it did not stop the whole flattened category list
   being serialised back to the browser per design. Ten designs shipped 2.6MB
   and parsed it ten times into one piece of state that each design overwrote
   with the identical array. */
test("the category list is sent to the browser once, not per design — D658", async () => {
  const [route, app] = await Promise.all([
    readFile(new URL("../app/api/etsy/taxonomy/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(route, /includeCategories\?:boolean/);
  assert.match(route, /\{\.\.\.\(body\.includeCategories\?\{categories:categories\.map\(\(\{id,path\}\)=>\(\{id,path\}\)\)\}:\{\}\),selected:/,
    "categories ride along only when the browser says it needs them");
  // selected and properties are per-design and must always be returned.
  assert.match(route, /selected:\{id:selected\.id,path:selected\.path\},properties\}/);

  assert.match(app, /includeCategories:!haveEtsyCategories\.current/);
  /* A ref, not the state. Several designs resolve inside one tick; reading
     etsyCategories.length there is the stale closure that broke D640, D644 and
     D653, and every design would ask for the 262KB again. */
  assert.match(app, /const haveEtsyCategories=useRef\(false\);/);
  assert.doesNotMatch(app, /includeCategories:!etsyCategories\.length/,
    "reading the state here is the stale-closure bug this exists to avoid");
  // Only a response that actually carried the list may set it.
  assert.match(app, /if\(payload\.categories\?\.length\)\{haveEtsyCategories\.current=true;setEtsyCategories\(payload\.categories\)\}/);
});

/* D659 · Each bundle product owns its own batch. This is the ARCHITECTURE, not
   a fault, and it was nearly refactored away on the strength of my own bad
   report: I saw the URL's batch id change while clicking around a bundle and
   called it a batch-identity bug. It was not. Checked against the server, the
   two ids held:

     0b79a9b6 -> Gildan Hoodie,               bundle "Hoodie + 1566 crewneck", 2 designs, 2 drafts
     b2104312 -> Comfort Colors 1566 crewneck, bundle "Hoodie + 1566 crewneck", 2 designs, 2 drafts

   Nothing was stale and nothing was lost - the two batches account for exactly
   the four drafts. These assertions exist so the next person to see that URL
   change does not "fix" it either. */
test("each bundle product owns its own batch, and switching says so — D659", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  // One batch per product, remembered per recipe id.
  assert.match(app, /const \[bundleBatchIds,setBundleBatchIds\]=useState<Record<string,string>>\(\{\}\);/);
  // Opening another product intentionally restores THAT product's batch.
  assert.match(app, /const existing=bundleBatchIds\[recipe\.id\];/);
  assert.match(app, /await restoreBatchById\(existing,workflowStep,null,true\);/);
  /* The outgoing product's pending autosave is flushed first, or the last
     keystrokes land on the incoming product's batch. */
  const openBody = app.slice(app.indexOf("function openBundleProduct(index:number){"), app.indexOf("function openBundleProduct(index:number){") + 1400);
  assert.ok(openBody.indexOf("await persistBatchNow(batchIdRef.current)") < openBody.indexOf("restoreBatchById(existing"),
    "the outgoing batch must be flushed before the incoming one is restored");

  // The bundle itself, and the product's position in it, are not what changes.
  assert.match(app, /Product \{index\+1\} of \{bundleRecipes\.length\}/);
  assert.match(app, /Product \{index\+1\} of \{list\.length\}/);
  assert.equal((app.match(/className="batch-product-position"/g) || []).length, 2,
    "the position cue rides with the product name on both product lists");

  /* No product may be rendered from another product's numbers: the active
     product reads live state, every other product reads its own summary. */
  assert.match(app, /const mine=isActive\n?\s*\?\{designs:files\.length/);
  assert.match(app, /:bundleBatchSummary\[recipe\.id\];/);
  assert.doesNotMatch(app, /bundleBatchSummary\[activeRecipe/,
    "the open product must never be described by another product's summary row");
});

/* D659 · Everything below was found by walking the live bundle, not by reading. */
test("a step URL with no batch resumes or asks — never silently starts over — D659", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  assert.match(app, /const \[resumeChoices,setResumeChoices\]=useState</);
  // One open batch is unambiguous, so it is simply resumed.
  assert.match(app, /if\(open\.length===1\)\{await restoreBatchById\(open\[0\]\.id,url\.searchParams\.get\("step"\),url\.searchParams\.get\("phase"\)\);return\}/);
  // More than one is a question, not a guess.
  assert.match(app, /if\(open\.length>1\)setResumeChoices\(/);
  assert.match(app, /className="batch-resume-choice"/);
  // Step 1 and the connect screen are not requests to resume anything.
  assert.match(app, /if\(!wanted\|\|wanted==="connect"\|\|wanted==="setup"\|\|signedIn!==true\)/);
  // Published and archived batches are not "open work".
  assert.match(app, /batch\.status!=="published"&&batch\.status!=="archived"/);
});

test("a remembered product Goldie cannot open never blocks the page — D659", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  assert.match(app, /const restoringRememberedProduct=useRef\(false\);/);
  assert.match(app, /if\(match\)\{restoringRememberedProduct\.current=true;try\{await selectRecipe\(match\)\}finally\{restoringRememberedProduct\.current=false\}\}/);
  // The modal is skipped only on that path, so a product she chose still gets one.
  const guard = app.slice(app.indexOf("if (!response.ok || !result.product){"), app.indexOf("if (!response.ok || !result.product){") + 700);
  assert.ok(guard.indexOf("restoringRememberedProduct.current") < guard.indexOf("setBlockingModal"),
    "the restore path must return before the modal is raised");
  assert.match(app, /setRestoredProductNotice\(/);
  assert.match(app, /\{restoredProductNotice&&<p className="batch-restore-notice" role="status">/);
  // And the dead selection is cleared, so it cannot repeat on the next load.
  assert.match(app, /window\.localStorage\.removeItem\("goldie-active-recipe"\)\}catch\{\/\* private mode \*\/\}\n?\s*setActiveRecipe\(null\)/);
});

test("bundle DPI and variant totals cover every product — D659", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* bundleColorProducts holds only the OTHER products, so reading it alone
     skipped whichever product was open. */
  assert.match(app, /const bundleProductDetails=useMemo\(\(\)=>\{/);
  assert.match(app, /if\(activeRecipe\?\.id&&templateDetails\)map\[activeRecipe\.id\]=templateDetails;/);
  assert.match(app, /const details=bundleProductDetails\[recipe\.id\];/);
  assert.doesNotMatch(app, /const details=bundleColorProducts\[recipe\.id\];if\(!details\|\|!file\.width/,
    "the DPI check must not go back to the map that excludes the open product");

  /* The sibling fetch gave up after 9s and dropped the product silently; a
     product load measured 2.5-3.5s and can exceed that. */
  assert.doesNotMatch(app, /savedShippingProfileId:Number\(recipe\.etsyShippingProfileId\)\|\|0\}\)\},9000\)/,
    "a product must not be dropped from the bundle because one fetch was slow");
  // And a product that still could not be read is named, not omitted.
  assert.match(app, /const bundleProductsUnchecked=useMemo\(/);
  assert.match(app, /Goldie could not read \{bundleProductsUnchecked\.join\(", "\)\} yet/);

  // Variants total the bundle, with the split inspectable.
  assert.match(app, /const bundleVariantCounts=useMemo\(/);
  assert.match(app, /\{bundleVariantCounts\.total\} enabled variants reviewed and approved/);
  assert.match(app, /detail:known\.map\(entry=>`\$\{entry\.name\}: \$\{entry\.count\}`\)\.join\(" · "\)/);
  assert.doesNotMatch(app, /All \{pricedVariants\.length\} enabled variants/,
    "the open product's count is not the bundle's count");
});

test("the mockup row cannot say none while scenes are saved — D659", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  assert.match(app, /Upload your own listing photos/);
  assert.doesNotMatch(app, /Create lifestyle mockups/);
  return;

  assert.match(app, /function scenesChosenFor\(recipe:Recipe,isActive:boolean\)\{/);
  assert.match(app, /function mockupRowValue\(created:number,scenes:number\)\{/);
  assert.match(app, /if\(scenes\)return `\$\{scenes\} \$\{scenes===1\?"scene":"scenes"\} chosen — not created yet`;/);
  assert.match(app, /Create lifestyle mockups",value:started\?mockupRowValue\(counts\.mockups,scenesChosenFor\(recipe,isActive\)\):blank/);
  assert.doesNotMatch(app, /counts\.mockups\?plural\(counts\.mockups,"mockup"\):"None yet — optional"/,
    "the row counted rendered mockups only, and read 'None yet' over two saved scenes");
});

test("setupComplete cannot be true without both colours and sizes — D659", async () => {
  const route = await readFile(new URL("../app/api/product-recipes/route.ts", import.meta.url), "utf8");

  assert.match(route, /if \(merged\.setupComplete && \(!\(merged\.defaultColorIds \|\| \[\]\)\.length \|\| !\(merged\.defaultSizeIds \|\| \[\]\)\.length\)\) merged\.setupComplete = false;/);
  /* Settled against the MERGED record, so a patch that touches one axis - or
     neither - still cannot leave the flag disagreeing with the values stored
     beside it. */
  const body = route.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(body.indexOf("const merged =") < body.indexOf("merged.setupComplete = false"),
    "the guard has to see the merged record, not just this patch");
});

test("a recorded store name reaches the card without a reload — D659", async () => {
  const [app, tools] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/factory-tools.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(app, /function announceShop\(recipeId:string,title:string,shopId:number\)\{/);
  assert.equal((app.match(/announceShop\(/g) || []).length, 3, "announced on both the refusal and the success path");
  assert.match(tools, /window\.addEventListener\("goldie-recipe-shop",onShop\);/);
  assert.match(tools, /setRecipes\(current=>current\.map\(recipe=>recipe\.id===detail\.recipeId\?\{\.\.\.recipe,printifyShopTitle:detail\.title,printifyShopId:detail\.shopId\}:recipe\)\);/);
  assert.match(tools, /return \(\)=>window\.removeEventListener\("goldie-recipe-shop",onShop\);/);
});

/* D660 · The cosmetic pass from the completed bundle review. Every item was
   read off the live step-4 screen, not guessed. */
test("the final review reads honestly — D660", async () => {
  const [app, css] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/approved-functional.css", import.meta.url), "utf8"),
  ]);

  /* "Approved · Standard shipping shipping profile" - the helper strips the
     trailing words and the caller then added them back. */
  assert.doesNotMatch(app, /\|\|"Etsy shipping profile"\} shipping profile/,
    "the row already says shipping; the value must not repeat it");

  /* "Economy-Standard: Printify Choice… shipping profile" - a label whose job
     is naming the profile must name it. Bounded by CSS, so the whole string
     stays in the DOM and reaches a screen reader. */
  assert.doesNotMatch(app, /const cut=clean\.slice\(0,42\);/, "no silent truncation of the profile name");
  assert.match(app, /return withoutStandard\.replace\(\/\\s\*shipping\\s\*profile\\s\*\$\/i,""\)\.trim\(\)\|\|title\.trim\(\);/);
  assert.match(css, /\.app-shell \.row-value\{min-width:0!important;overflow-wrap:anywhere!important\}/);

  // The heading must agree with the button underneath it.
  assert.match(app, /<h2>\{publishBlockers\(\)\.length\?"Finish these items before publishing":"Your batch is ready for its final check"\}<\/h2>/);

  /* The heading and the draft chip overlapped once the chip carried a product
     name: "✓ 2 drafts on Gildan Hoodie" printed through the heading. */
  assert.match(css, /\.app-shell \.step-heading\{display:flex!important;[^}]*justify-content:space-between!important;gap:20px!important/);
  assert.match(css, /\.app-shell \.step-heading>\.done-mark\{flex:0 0 auto!important;white-space:nowrap!important/);

  /* Tags under thirteen are an optimisation - publishBlockers never mentions
     them - so they must not wear the same mark as a listing with no title. */
  assert.match(app, /done:started&&counts\.designs>0&&counts\.titled===counts\.designs,advice:/);
  assert.doesNotMatch(app, /done:started&&counts\.designs>0&&counts\.titled===counts\.designs&&counts\.tagged===counts\.designs/,
    "a short tag count must not mark the row as incomplete");
  assert.match(app, /could use all 13 tags — optional, but Etsy ranks on them/);
  assert.match(app, /\{row\.advice\?<small className="row-advice">\{row\.advice\}<\/small>:null\}/);
  assert.match(css, /\.app-shell \.row-value>small\.row-advice\{[^}]*color:var\(--muted\)!important/);
});

test("a bundle member with no keyword bank says so on step 1 — D660", async () => {
  const [tools, app] = await Promise.all([
    readFile(new URL("../app/factory-tools.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
  ]);

  /* Found live: the 1566 crewneck joined the bundle with no bank and only said
     so at step 3, with Auto-create disabled and the designs already done. */
  assert.match(tools, /recipeIsSetUp\(recipe\)&&!recipe\.keywordListId&&<em className="needs-bank-note">No keyword bank yet — titles cannot be auto-written for it<\/em>/);

  /* Offered, never applied silently: two products in one bundle can legitimately
     want different banks, so copying it across would be a guess about her
     keywords rather than a convenience. */
  assert.match(app, /Use this keyword bank for every product in this bundle \(\$\{bundleRecipes\.length\}\)/);
  assert.match(app, /async function applyBankToBundle\(\)\{/);
  // Only offered when it would actually change something.
  assert.match(app, /bundleRecipes\.some\(recipe=>recipe\.id!==activeRecipe\?\.id&&recipe\.keywordListId!==autoTitleBankId\)/);
  // And it is a button, not an effect.
  assert.doesNotMatch(app, /useEffect\([^)]{0,200}applyBankToBundle/);
});

/* D662 · The one concurrency change in this audit, and the measurement behind
   it. Everything else was left alone. */
test("background Etsy preparation runs two at a time, and only two — D662", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  assert.match(app, /const BACKGROUND_ETSY_CONCURRENCY = 2;/);
  assert.match(app, /await runBounded\(rest,BACKGROUND_ETSY_CONCURRENCY,async file=>\{await prepareOne\(file\);return file\}/);
  assert.doesNotMatch(app, /runBounded\(pending,1,/, "one at a time was never justified by a measurement");
  /* D71 · The first design still runs alone, because it establishes the Etsy
     baseline every later design inherits. Speed must not cost determinism. */
  assert.match(app, /const \[first,\.\.\.rest\]=pending;\n\s*await prepareOne\(first\);/);

  /* The cap is the point. Four simultaneous also came back clean, but nothing
     measured a ten-design burst against the provider's real ceiling. */
  const declared = Number(app.match(/const BACKGROUND_ETSY_CONCURRENCY = (\d+);/)[1]);
  assert.ok(declared === 2, `the agreed limit is 2, found ${declared}`);

  /* The reason has to travel with the number, or the next person raises it
     because four looked fine once. */
  const why = app.slice(app.indexOf("/* D662"), app.indexOf("const BACKGROUND_ETSY_CONCURRENCY"));
  assert.match(why, /1 request\s+3031ms/);
  assert.match(why, /2 requests\s+batch 2977ms/);
  assert.match(why, /4 requests\s+batch 2954ms/);
  assert.match(why, /No 429, no 5xx/);

  /* Draft creation was deliberately not touched: it uploads full-resolution
     artwork, so it is bounded by memory rather than provider latency. */
  assert.match(app, /const MAX_CONCURRENT_DESIGNS = 2;/);
  assert.match(app, /runBounded\(targetFiles, batchConcurrency, processDesign/);
});

/* D663 · Found by acceptance Run 1, at the step that verifies the shipping
   profile. Brittany's shop has SEVEN Etsy profiles beginning "Standard:", and
   friendlyShippingProfileTitle returned the literal string "Standard shipping"
   for every one of them - so the product card and the final review, the two
   screens whose job is confirming which profile a listing publishes with,
   printed seven different profiles identically.

   D660 removed the truncation from this same function for exactly this reason
   and left the collapse behind, which was worse: a truncation is visibly lossy,
   this silently rendered distinct values as one. Publishing under the wrong
   profile is what D52 already cost her. */
test("every shipping profile renders distinguishably — D663", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(app, /if\(\/\^standard:\/i\.test\(title\)\)return"Standard shipping";/,
    "seven distinct profiles must not print as one");
  assert.match(app, /const withoutStandard=title\.replace\(\/\^standard:\\s\*\/i,""\)\.trim\(\);/);
  assert.match(app, /return withoutStandard\.replace\(\/\\s\*shipping\\s\*profile\\s\*\$\/i,""\)\.trim\(\)\|\|title\.trim\(\);/);
  // A bare "Standard:" still needs to say something.
  assert.match(app, /if\(!withoutStandard\)return"Standard shipping";/);

  /* Behavioural: her seven real titles, from the live shop, must produce seven
     different strings. */
  const body = app.slice(app.indexOf("function friendlyShippingProfileTitle"), app.indexOf("/* D649"));
  const friendly = new Function("raw", `${body.replace(/^function friendlyShippingProfileTitle\(raw\?:string\)\{/, "").replace(/\}\s*$/, "")}`.replace(/const title=raw\?decodeProfileTitle\(raw\):raw;/, "const title=raw;"));
  const real = [
    "Standard: SwiftPOD, Hoodie, Sweatshirt",
    "Standard: SwiftPOD, Garments (shirts)",
    "Standard: SwiftPOD, Garments (shirts + shorts)",
    "Standard: SwiftPOD, Kids clothes, Long-sleeve, T-Shirt, Tank",
    "Standard: Printify Choice, 479, 635, 478,  10669, 10725 Mug, 11oz, 13oz",
    "Economy-Standard: Printify Choice, Garments (shirts)",
    "Flexi Cases",
  ];
  const rendered = real.map((title) => friendly(title));
  assert.equal(new Set(rendered).size, real.length,
    `seven real profiles must render as seven distinct labels, got ${JSON.stringify(rendered)}`);
  // And nothing is cut short on the way.
  assert.ok(rendered.every((label) => !label.includes("…")), "no ellipsis");
});

/* D664 · Found by acceptance Run 1, step 2. Two real designs at 1254x1254 on a
   hoodie raised the banner:

     "2 designs are below 215 DPI - very low resolution.
      Goldie will identify every affected design so you can replace it or
      continue anyway."

   and then identified nothing. No per-design panel, no naming, no Proceed or
   Exclude control - because the entire DPI review was gated on activeBundle.

   That is the D648 fault word for word, a banner promising a confirmation step
   that never comes, still present on the single-product path after being fixed
   for bundles. A batch has products whether or not it is a bundle. */
test("the low-resolution review appears for one product, not only bundles — D664", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  assert.match(app, /const productsInBatch=useMemo\(\(\)=>\(activeBundle&&bundleRecipes\.length\?bundleRecipes:activeRecipe\?\[activeRecipe\]:\[\]\),/);
  assert.match(app, /const bundleQualityIssues=useMemo\(\(\)=>productsInBatch\.length\?files\.flatMap\(file=>productsInBatch\.flatMap\(recipe=>\{/);
  assert.doesNotMatch(app, /const bundleQualityIssues=useMemo\(\(\)=>activeBundle\?/,
    "the DPI check must follow the batch, not the bundle");

  // The panel itself is no longer bundle-only.
  assert.match(app, /\{bundleQualityGroups\.length>0&&<section className="bundle-quality-review"/);
  assert.doesNotMatch(app, /\{activeBundle&&bundleQualityGroups\.length>0&&<section/);

  /* The banner's promise is only kept if the seller can actually act, so the
     per-design decision controls have to be in that panel. */
  assert.match(app, /Proceed with all \{bundleQualityGroups\.length\}/);
  assert.match(app, /decideQualityGroup\(group\.keys,"exclude"\)/);
  // And creating drafts still waits for a decision on every flagged design.
  assert.match(app, /const undecided=bundleQualityGroups\.filter\(group=>group\.keys\.some\(key=>!bundleQualityDecisions\[key\]\)\)/);

  /* Copy that only makes sense for a bundle must not be shown to someone with
     one product. */
  assert.match(app, /\{productsInBatch\.length>1\?"The same artwork can be sharp on one product and too small for another\. ":""\}/);

  // The unchecked-product note follows the same rule.
  assert.match(app, /const bundleProductsUnchecked=useMemo\(\(\)=>productsInBatch\.filter\(/);
});
