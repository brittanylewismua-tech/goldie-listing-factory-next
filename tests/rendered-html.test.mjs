import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

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
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const globalCss = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const approvedCss = await readFile(new URL("../app/approved-functional.css", import.meta.url), "utf8");
  assert.match(pageSource, /Goldie Listing Factory/);
  assert.match(pageSource, /Connect Printify/);
  assert.match(pageSource, /Secure connection/);
  assert.match(pageSource, /Choose or create a saved product/);
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
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
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
  assert.match(page, /Doing so may halt your current design uploads/);
  assert.match(page, /setUploadNoticeOpen\(true\)/);
  assert.match(page, /beforeunload/);
  assert.match(page, /Open all in Printify/);
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
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/factory-tools.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/integrated-mockups.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/drafts/route.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(page, /factory-switcher/);
  assert.match(recipes, /Connect this Printify template/);
  assert.match(recipes, /Goldie checks the product, variations, placement, shipping, costs, and description/);
  assert.match(recipes, /saved product/);
  assert.match(recipes, /Add another product/);
  assert.match(recipes, /Product saved and selected/);
  assert.match(recipes, /props\.onUseRecipe\(saved\)/);
  assert.match(recipes, /You will set pricing and listing photos later/);
  assert.doesNotMatch(recipes, /Shipping cost|Shipping charged|Payment fixed fee/);
  assert.doesNotMatch(page, /Apply titles in order|Import title CSV/);
  assert.match(recipes, /validated phrases available to Goldie/);
  assert.match(page, /Exact title phrases/);
  assert.match(page, /300 DPI recommended/);
  assert.match(page, /Choose Printify flatlays/);
  assert.match(page, /IntegratedMockups/);
  assert.match(mockups, /Choose a mockup set/);
  assert.match(mockups, /Create .*mockups/);
  assert.match(drafts, /approved>=Number\(cost\?\?price\)/);
  assert.match(drafts, /finalPrice/);
  assert.match(drafts, /template\.shippingByVariant\?\.\[id\]/);
  assert.match(drafts, /printifyImages/);
});

test("groups equal-cost Printify variants while preserving individual review and starts new products blank", async () => {
  const [page, recipes, printify] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/factory-tools.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Review item prices and shipping/);
  assert.match(page, /variant\.templatePrice/);
  assert.match(page, /Lowest estimated profit/);
  assert.match(page, /normalizePricesByCost/);
  assert.match(page, /changeCostGroupPrice/);
  assert.match(page, /grouped\.set\(variant\.cost/);
  assert.match(page, /item\.cost===cost/);
  assert.match(page, /exact same Printify product cost/);
  assert.match(page, /color, size, material, finish, or other option costs more/);
  assert.doesNotMatch(page, /Sizes and colors shown below/);
  assert.match(page, /edit one separately/i);
  assert.doesNotMatch(page, /Approve pricing \+ shipping/);
  assert.match(page, /Continue to create drafts/);
  assert.match(page, /onApprovalChange\(Boolean\(selectedProfile&&!customDirty\)\)/);
  assert.match(page, /variantPrices/);
  assert.match(page, /pricingApproved/);
  assert.match(printify, /variants:enabledVariants\.map/);
  assert.match(recipes, /onStartNewProduct/);
  assert.match(page, /function startNewProduct/);
  assert.match(page, /clearCurrentBatch\(true\)/);
  assert.doesNotMatch(page, /staged for all/);
});

test("provides thorough contextual help throughout all nine Listing Factory steps", async () => {
  const [page, help, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/context-help.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /const WORKFLOW_HELP = \[/);
  assert.match(page, /WORKFLOW_HELP\[progressIndex\]/);
  assert.match(page, /Connect Printify and Etsy/);
  assert.match(page, /Choose or create a saved product/);
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
  assert.match(css, /\.context-help-trigger/);
  assert.match(css, /\.context-help-dialog/);
});

test("stages each finished mockup group for its exact Etsy listing", async () => {
  const [mockups,images,page] = await Promise.all([
    readFile(new URL("../app/integrated-mockups.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/etsy/images/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
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

test("renders Mockup Sets as management only", async () => {
  const response = await render("/mockups");
  const html = await response.text();
  assert.match(html, /Manage your mockup sets/);
  assert.match(html, /Add mockup set/);
  assert.match(html, /class="management-nav"/);
  assert.match(html, />Listing Factory<\/a>/);
  assert.doesNotMatch(html, /mockupFooter/);
  assert.doesNotMatch(html, /Add this design/);
  assert.doesNotMatch(html, /Create your mockups/);
});

test("guides sellers through the complete resumable nine-step workflow",async()=>{
  const [page,batches,route,cache,styles]=await Promise.all([
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
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
});

test("imports Printify product facts and automatically prepares product-specific Etsy details",async()=>{
  const [page,printify,intelligence,drafts]=await Promise.all([
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
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
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
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
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /maxPlacementScale:isRigidPaperProduct\(templateDetails\)\?1:undefined/);
  assert.doesNotMatch(page, /Target:\s*\{templateDetails/);
  assert.match(page, /DPI in Printify/);
});

test("calculates every Printify variant price from its own cost and Etsy fee profile", async () => {
  const { estimatedProfit, recommendedPrice } = await import("../app/pricing.ts");
  const pricing = { targetProfit: 10, etsyFeePercent: 9.5, fixedFee: 0.25, listingFee: 0.20, shippingCost: 0, shippingCharged: 0 };
  assert.equal(recommendedPrice(1034, pricing), 2298);
  assert.equal(recommendedPrice(1184, pricing), 2463);
  assert.equal(recommendedPrice(1760, pricing), 3100);
  assert.equal(recommendedPrice(1034), 1034);
  assert.equal(recommendedPrice(1000, { targetProfit: 10, etsyFeePercent: 10, fixedFee: .25, listingFee: .20, shippingCost: 5, shippingCharged: 5 }), 2328);
  assert.equal(recommendedPrice(1000, { targetProfit: 10, etsyFeePercent: 9.5, fixedFee: .25, listingFee: .20, shippingCost: 6, shippingCharged: 3 }), 2623);
  assert.equal(recommendedPrice(1000, { targetProfit: 10, etsyFeePercent: 9.5, fixedFee: .25, listingFee: .20, shippingCost: 4, shippingCharged: 3 }), 2402);
  assert.equal(recommendedPrice(1000, { targetProfit: 0, etsyFeePercent: 9.5, fixedFee: .25, listingFee: .20, shippingCost: 6, shippingCharged: 3 }), 1518);
  const overCollectedShipping = { targetProfit: 10, etsyFeePercent: 9.5, fixedFee: .25, listingFee: .20, shippingCost: 4, shippingCharged: 6 };
  assert.equal(recommendedPrice(1000, overCollectedShipping), 2102);
  assert.ok(estimatedProfit(2102, 1000, overCollectedShipping) >= 10);
  assert.ok(estimatedProfit(2102, 1000, overCollectedShipping) < 10.02);
  const crewneck = { targetProfit: 10, etsyFeePercent: 9.5, fixedFee: .25, listingFee: .20, shippingCost: 11.49, shippingCharged: 25 };
  const crewneckPrice = recommendedPrice(3100, crewneck);
  assert.ok(estimatedProfit(crewneckPrice, 3100, crewneck) >= 10);
  assert.ok(estimatedProfit(crewneckPrice, 3100, crewneck) < 10.02);
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /stillUsingTemplatePrices/);
  assert.match(page, /Goldie calculated every price from your profit goal, product costs, shipping, and Etsy fees/);
  assert.match(page, /if\(profile\)recalculate\(pricing,profile\.domesticPrimary\)/);
});

test("processes a 20-design batch with bounded two-at-a-time concurrency", async () => {
  const [page, boundedSource] = await Promise.all([readFile(new URL("../app/page.tsx", import.meta.url), "utf8"), readFile(new URL("../app/bounded-work.ts", import.meta.url), "utf8")]);
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
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
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
  assert.match(drafts, /export async function GET\(request: Request\)/);
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
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
  assert.deepEqual(tagsFromTitle("Western Cowgirl Wall Art, Motivational Office Poster, Entrepreneur Gift"), ["western cowgirl", "wall art", "motivational office", "office poster", "entrepreneur gift"]);
  assert.deepEqual(titlesFromCsv('Title,Searches\n"Western Art, Cowgirl Decor",200\n"CEO Office Art",100'), ["Western Art, Cowgirl Decor", "CEO Office Art"]);
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
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
  ]);
  assert.doesNotMatch(page,/goldie-wordmark\.webp/);assert.match(page,/className="management-nav"/);assert.match(page,/<a href=\{returnHref\}>Listing Factory<\/a>/);assert.match(page,/save-toast/);assert.doesNotMatch(page,/return-to-work/);
  assert.match(page,/goldie-active-batch/);assert.match(page,/Save changes/);assert.match(page,/Create another bank/);
  assert.match(route,/already exists\. Open that bank to update it instead/);
  assert.match(home,/href="\/keywords" target="_blank"/);assert.match(home,/href="\/mockups" target="_blank"/);
});

test("creates unique validated AI titles in bulk with per-listing overrides", async()=>{
  const [page,tools,intelligence]=await Promise.all([
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/factory-tools.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/listing-intelligence/route.ts",import.meta.url),"utf8"),
  ]);
  assert.match(page,/Create titles for the whole batch/);assert.match(page,/Auto-create all titles/);assert.match(page,/runBounded\(files,2/);
  assert.match(page,/Goldie selects from my bank/);assert.match(page,/I choose from my bank/);assert.match(page,/Click keywords in the order you want them/);
  assert.match(page,/removeBatchKeyword/);assert.match(page,/clearBatchKeywords/);assert.match(page,/Applied to every listing below/);
  assert.match(page,/Create a different title with AI/);assert.match(page,/Create title for this design/);
  assert.match(page,/autoTitleForDesign/);assert.match(page,/tagsFromTitle\(item\.result\.keywords\.join/);
  assert.match(page,/unique titles and matching tags created/);assert.match(page,/Goldie selects only exact phrases from this bank/);assert.match(page,/Goldie never adds keywords/);
  assert.ok(page.indexOf('className="permanent-description batch-description"')<page.indexOf('className="design-table"'),"The collapsible batch description belongs directly above the individual listings.");
  assert.match(page,/Customize this listing’s description/);assert.match(page,/The complete description is shown below/);
  assert.match(page,/descriptionOverride/);assert.match(page,/scrollIntoView/);
  assert.match(tools,/keywordListsCache/);assert.match(tools,/selectionOnly/);assert.match(tools,/onSelect/);
  assert.match(intelligence,/selected_keywords/);assert.match(intelligence,/allowedByLower/);assert.match(intelligence,/Reject irrelevant phrases/);
});

test("records permanent sanitized Printify diagnostics without blocking listings", async () => {
  const [page, stage, drafts, diagnostics, admin, adminPage, schema] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
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
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
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
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
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
  assert.match(page, /accountSignInPath\("\/mastermind"\)/);
  assert.match(page, /20 listings and 20 AI lifestyle mockups/);
  assert.match(page, /BetaCountdown/);
  assert.match(page, /preview === "welcome"/);
  assert.match(page, /<ListingFactory \/>/);
  assert.match(redeem, /INSERT INTO mastermind_access/);
  assert.match(admin, /DELETE FROM printify_connections/);
  assert.match(admin, /SELECT user_id FROM mastermind_access/);
  assert.match(access, /toUpperCase/);
  assert.match(access, /brittanylewismua@gmail\.com/);
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

test("limits each listing to four lifestyle mockups and shows the recommended photo mix", async () => {
  const [mockups, page] = await Promise.all([
    readFile(new URL("../app/integrated-mockups.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(mockups, /MAX_MOCKUPS_PER_LISTING=4/);
  assert.match(mockups, /next\.size>=MAX_MOCKUPS_PER_LISTING/);
  assert.match(mockups, /Goldie recommends choosing three/);
  assert.match(page, /Recommended listing photo mix/);
  assert.match(page, /3 lifestyle model mockups/);
  assert.match(page, /Printify flatlays of each color offered/);
  assert.match(page, /1 item-specific size guide/);
});

test("enforces paid-plan usage on the server and exposes honest usage", async()=>{
  const [plans,drafts,renders,library,usage]=await Promise.all([
    readFile(new URL("../app/plan-limits.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/printify/drafts/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/mockups/render/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/mockups/library/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/usage/route.ts",import.meta.url),"utf8"),
  ]);
  assert.match(plans,/price: 29, drafts: 200, dailyListings: 40, aiMockups: 100, mockupSets: 10/);
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
  const [page,renderers,route]=await Promise.all([
    readFile(new URL("../app/mockups/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/mockups/product-renderers.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/mockups/render/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page,/"rigid-flat" \| "apparel" \| "soft-goods" \| "curved" \| "irregular"/);
  assert.match(page,/made\.forEach\(item=>URL\.revokeObjectURL/);
  assert.match(page,/setResults\(\[\]\);setGenerationError/);
  assert.match(route,/if\(!body\.reference\)/);
  assert.match(route,/plan\.aiMockups/);
  assert.match(route,/monthKey/);
  assert.match(renderers,/fashn\/tryon\/v1\.6/);
  assert.match(renderers,/model_image:scene/);
  assert.match(renderers,/garment_image:reference/);
  assert.doesNotMatch(renderers,/shirt-design/);
  assert.match(renderers,/seedream\/v5\/lite\/edit/);
});

test("draft progress cannot exceed the selected batch", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page,/draftRunActive\.current/);
  assert.match(page,/completedDesignIds\.has\(result\.clientId\)/);
  assert.match(page,/Math\.min\(completedDesignIds\.size,targetFiles\.length\)/);
});

test("keeps pricing simple while using a real Etsy shipping profile and exact template prices", async () => {
  const [page,drafts,profiles,publish] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/drafts/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/etsy/shipping-profiles/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/drafts/publish/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page,/Shipping profile/);
  assert.match(page,/Selected automatically from your product template/);
  assert.match(page,/templateProfileId=Number\(templateDetails\?\.shippingTemplateId\)/);
  assert.match(page,/setEtsyShippingProfileId\(current=>current\|\|templateProfileId\)/);
  assert.match(page,/buyer pays/);
  assert.match(page,/international rates/i);
  assert.match(page,/international-shipping-editor/);
  assert.match(page,/\{selectedProfile\.originCountry\} buyer pays/);
  assert.match(page,/Save new shipping profile/);
  assert.match(page,/1\. Item prices/);
  assert.match(page,/Printify product cost/);
  assert.match(page,/price-group-list/);
  assert.match(page,/Printify cost/);
  assert.match(page,/2\. Shipping/);
  assert.doesNotMatch(page,/Update prices/);
  assert.match(page,/Prices update automatically/);
  assert.match(page,/changeProfit\(value:number\)[\s\S]*recalculate\(nextPricing\)/);
  assert.match(page,/Create a custom shipping profile \(optional\)/);
  assert.match(page,/Your current prices already meet this profit goal/);
  assert.match(page,/recommendation-result/);
  assert.match(page,/Discard changes/);
  assert.match(page,/save or discard any custom shipping profile changes/i);
  assert.doesNotMatch(page,/Approve pricing \+ shipping/);
  assert.match(page,/Printify fulfillment shipping/);
  assert.match(page,/Review every enabled variation before Goldie creates the drafts/);
  assert.doesNotMatch(page,/pricing target, keyword bank, and mockup defaults/);
  assert.match(page,/variant\.templatePrice/);
  assert.match(page,/See how Goldie calculated these prices/);
  assert.doesNotMatch(page,/Split it 50\/50|Custom buyer shipping price|shippingPercent/);
  assert.match(profiles,/shipping-profiles/);
  assert.match(profiles,/domesticPrimary/);
  assert.match(publish,/etsyShippingProfileId/);
  assert.match(drafts,/shipping_template_id:selectedShippingTemplateId/);
  assert.match(drafts,/etsyBuyerShipping/);
  assert.match(page,/loadTemplateUrl\(recipe\.templateUrl,nextPricing,Number\(recipe\.etsyShippingProfileId\)\|\|0\)/);
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
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/batches/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page,/\(!files\.length&&!drafts\.length\)\)return/);
  assert.match(batches,/Remove from history/);
  assert.match(batches,/does not delete products from Printify or listings from Etsy/);
  assert.match(batches,/method:"DELETE"/);
});

test("connects Etsy with PKCE and finishes only the exact Printify-linked Etsy listing", async()=>{
  const [page,oauth,callback,client,publish,queue,finish,migration]=await Promise.all([
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
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
  const [page,finish]=await Promise.all([readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),readFile(new URL("../app/api/etsy/finish.ts",import.meta.url),"utf8")]);
  assert.match(page,/\.join\("\\n\\n"\)/);
  assert.match(finish,/shipping_profile_id:String\(shippingProfileId\),description/);
  assert.match(finish,/String\(draft\.description\|\|""\)/);
});

test("makes progress satisfying and returns a precise outcome receipt", async()=>{
  const [page,ui,theme]=await Promise.all([
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
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
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
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
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
  ]);
  assert.match(printify,/externalListingId/);
  assert.match(printify,/shipping_profile_id/);
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

test("places each step count directly below its page title", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/approved-functional.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /<div className="heading-with-help hero-title-help"><h1>\{workflowHero\.title\}<\/h1><ContextHelp[\s\S]*?<\/div>\s*<p className="hero-step-count">Step \{progressIndex\+1\} of \{PROGRESS_STEPS\.length\}<\/p>/);
  assert.doesNotMatch(page, /className="approved-step-count"/);
  assert.match(styles, /\.app-shell \.hero-step-count/);
  assert.match(styles, /\.app-shell \.hero\{padding-bottom:30px!important\}/);
});

test("labels every progress bubble with a short workflow name", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/approved-functional.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /const PROGRESS_SHORT_LABELS = \["Connect","Product","Designs","Pricing","Drafts","Titles \+ tags","Etsy details","Photos","Publish"\]/);
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
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/approved-functional.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /fileNotice&&workflowStep==="designs"&&<p className="file-add-notice"/);
  assert.match(page, /Titles, tags, and descriptions complete/);
  assert.match(page, /Etsy details complete/);
  assert.match(page, /Listing photos complete/);
  assert.doesNotMatch(page, /fileNotice&&workflowStep!=="designs"/);
  assert.match(styles, /\.app-shell \.step-success-banner\{/);
  assert.match(styles, /border:1px solid rgba\(47,122,78,\.34\)/);
});

test("supports whole-number pricing, unclipped profit columns, and optional title caps", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Create whole-number pricing/);
  assert.match(page, /Math\.ceil\(current\/100\)\*100/);
  assert.match(page, /Auto Caps \{titleCaps\?"on":"off"\}/);
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
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
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
  assert.match(page, />Listing Factory</);
  assert.match(page, /Listing Factory Scale/);
  assert.match(page, /Manage current plan/);
  assert.match(page, /choosePlan\("scale"\)/);
  assert.match(styles, /\.usage-plan-grid/);
  assert.match(styles, /article\.current/);
});

test("supports Etsy's current multi-question personalization workflow", async () => {
  const [page, finish] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
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
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
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
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
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
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
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
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
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
  assert.match(workflow, /Using this design on multiple products/);
  assert.match(workflow, /Ready for this batch/);
  assert.match(workflow, /Choose the products in the order you want to complete them/);
  assert.match(workflow, /bundleSaveLock\.current/);
  assert.match(workflow, /Saving bundle…/);
  assert.match(workflow, /aria-busy=\{bundleSaving\}/);
  assert.match(api, /deduplicated:true/);
  assert.match(page, /function useBundle/);
  assert.match(page, /You are working on \{bundleRecipes\[bundleIndex\]\?\.name\}/);
  assert.match(page, /1\. Item prices <span>· \{productName\}<\/span>/);
  assert.match(page, /2\. Shipping <span>· \{productName\}<\/span>/);
  assert.match(page, /data-product-selected=\{templateDetails\?"true":"false"\}/);
  assert.match(page, /--active-product/);
  assert.match(page, /function continueBundle/);
  assert.match(page, /activeBundle,bundleRecipes,bundleIndex/);
  assert.match(page, /previewUrl:URL\.createObjectURL\(file\.file\)/);
  assert.match(page, /descriptionOverride:undefined/);
  assert.match(page, /setWorkflowStep\("review"\)/);
  assert.match(ui, /Continue bundle with/);
  assert.match(ui, /pricing, shipping, description, Etsy details, and images separately/);
  assert.match(styles, /\.bundle-progress/);
  assert.match(styles, /CURRENT PRODUCT ·/);
  assert.doesNotMatch(styles, /\.designs-step\.active-panel \.step-content:before/);
  assert.match(styles, /\.etsy-details-step\.active-panel \.step-content:before/);
  assert.match(styles, /\.final-review\.active-panel \.step-content:before/);
  assert.match(styles, /\.launch-panel\.active-panel \.launch-top:before/);
  assert.match(styles, /\.post-draft-heading>div:before/);
  assert.match(approvedStyles, /\.app-shell \.recipe-card \.edit-recipe\{position:static!important/);
  assert.match(approvedStyles, /\.app-shell \.recipe-card \.delete-recipe\{position:static!important/);
  assert.match(approvedStyles, /\.app-shell \.recipe-card \.recipe-use,[\s\S]*?grid-column:1\/-1!important/);
  assert.match(approvedStyles, /Collision safeguards shared by every workflow step/);
});

test("downloads each listing's selected Printify photos and created mockups as one local ZIP",async()=>{
  const [page,route,styles]=await Promise.all([
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
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
  assert.match(source,/Finish this product in Printify first/);
  assert.match(source,/Add any design and set its placement/);
  assert.match(source,/Choose every size and color you want to sell/);
  assert.match(source,/Choose the Printify mockups/);
  assert.match(source,/Set the shipping profile and publish to Etsy once/);
  assert.match(source,/open its product editor/);
  assert.match(source,/Do not use: the Etsy listing URL or a product ID by itself/);
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
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/usage/route.ts",import.meta.url),"utf8"),
  ]);
  assert.match(plans,/drafts: 200, dailyListings: 40/);
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
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/integrated-mockups.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8"),
  ]);
  assert.match(workflow,/setPendingAction\(`recipe:\$\{recipe\.id\}`\)/);
  assert.match(workflow,/Loading product details…/);
  assert.match(workflow,/Loading every product in this bundle…/);
  assert.match(workflow,/actionLock\.current/);
  assert.match(page,/aria-busy=\{preparingEtsy\}/);
  assert.match(page,/aria-busy=\{running\|\|preparingEtsy\}/);
  assert.match(page,/aria-busy=\{publishing\}/);
  assert.match(mockups,/aria-busy=\{busy\}/);
  assert.match(styles,/button\[aria-busy="true"\]/);
  assert.match(styles,/goldie-action-spin/);
});

test("centers the complete images and mockups heading group",async()=>{
  const styles=await readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8");
  assert.match(styles,/\.post-draft-workspace \.post-draft-heading\{[\s\S]*?justify-items:center!important/);
  assert.match(styles,/\.post-draft-workspace \.post-draft-heading>div\{[\s\S]*?justify-items:center/);
  assert.match(styles,/\.post-draft-heading \.open-all-button\{[\s\S]*?margin:0 auto!important/);
});

test("keeps each Printify editing action with its listing details",async()=>{
  const [page,styles]=await Promise.all([
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8"),
  ]);
  assert.match(page,/tag-row[\s\S]*?draft\.editorUrl[\s\S]*?Open in Printify to resize or reposition[\s\S]*?<\/div><\/div>/);
  assert.match(styles,/div:not\(\.pending-preview\)>\.edit-draft-button\{margin:16px 0 0;align-self:flex-start\}/);
});

test("explains and styles every Printify photo selection action",async()=>{
  const [page,styles]=await Promise.all([
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8"),
  ]);
  assert.match(page,/Remove every selected Printify photo from this listing only/);
  assert.match(page,/Choose the same Printify photos across the entire batch/);
  assert.match(page,/Preselect these photos whenever you use this saved product again/);
  assert.match(page,/Applied to every listing/);
  assert.match(page,/Saved for future batches/);
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
  assert.doesNotMatch(managementMarkup,/setPreview/);
  assert.doesNotMatch(managementMarkup,/items\.slice\(0,3\)/);
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
  assert.match(mockups,/Promise\.all\(chosen\.map/);
  assert.match(mockups,/completed\.entries\(\)\]\.sort/);
  assert.doesNotMatch(mockups,/for\(const t of chosen\)/);
  assert.match(mockups,/A T-shirt scene should not be used for a sweatshirt or hoodie listing/);
});

test("requires a photo on every listing and lets sellers set Etsy photo order",async()=>{
  const [page,organizer,images,finish]=await Promise.all([
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/listing-photo-order.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/etsy/images/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/etsy/finish.ts",import.meta.url),"utf8"),
  ]);
  assert.match(page,/Add at least one photo to/);
  assert.match(page,/createdListingsMissingImages\(\)/);
  assert.match(page,/preparedMockupCounts\[draft\.id\]/);
  assert.match(page,/if\(imageStepError&&allCreatedListingsHaveImages\(\)\)/);
  assert.match(page,/At least one image on every listing/);
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
