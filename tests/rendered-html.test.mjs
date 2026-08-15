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

test("server-renders the branded Listing Factory", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Goldie Listing Factory/);
  assert.match(html, /Connect Printify\./);
  assert.match(html, /Secure workspace/);
  assert.doesNotMatch(html, /Private workspace/);
  assert.match(html, /Your Printify account/);
  assert.match(html, /Choose a saved product or add another/);
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const globalCss = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(pageSource, /How to get your Printify token/);
  assert.match(pageSource, /token connects the account/);
  assert.match(html, /Connect this Printify template/);
  assert.match(html, /imports its product facts and permanent description/);
  assert.doesNotMatch(html, /Default title structure|Optional reusable description/);
  assert.doesNotMatch(html, /factory-switcher/);
  assert.match(html, /Add your finished designs/);
  assert.match(html, /Choose individual images/);
  assert.match(html, /already be upscaled/);
  assert.match(html, /transparent-background PNG/);
  assert.match(html, /Connect Printify first/);
  assert.match(html, /20 finished designs/);
  assert.match(html, /no combined file-size cap/);
  assert.match(html, /100 MB per design/);
  assert.match(html, /without lowering DPI/);
  assert.match(html, /Listings remain unpublished/);
  assert.match(globalCss, /@media\(max-width:650px\).*\.top-nav\{flex-wrap:wrap;white-space:normal/s);
  assert.doesNotMatch(html, /pink-dorm-collage|rich-man-poster|cowgirl-disco|newest batch will open/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("uses individual shop-aware Printify editor buttons", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/drafts/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /Adjust in Printify/);
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
  assert.match(page, /Wait—your files are still uploading/);
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
  assert.match(recipes, /imports its product facts and permanent description/);
  assert.match(recipes, /saved product/);
  assert.match(recipes, /Add another product/);
  assert.match(recipes, /Product saved and selected/);
  assert.match(recipes, /props\.onUseRecipe\(saved\)/);
  assert.match(recipes, /This saved product only needs the profit you want/);
  assert.doesNotMatch(recipes, /Shipping cost|Shipping charged|Payment fixed fee/);
  assert.doesNotMatch(page, /Apply titles in order|Import title CSV/);
  assert.match(recipes, /saved bank/);
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

test("requires explicit review of every Printify variant and starts new products blank", async () => {
  const [page, recipes, printify] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/factory-tools.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /See and approve every enabled variant/);
  assert.match(page, /Printify cost/);
  assert.match(page, /Projected profit/);
  assert.match(page, /Approve all variant prices/);
  assert.match(page, /variantPrices/);
  assert.match(page, /pricingApproved/);
  assert.match(printify, /variants:enabledVariants\.map/);
  assert.match(recipes, /onStartNewProduct/);
  assert.match(page, /function startNewProduct/);
  assert.match(page, /clearCurrentBatch\(true\)/);
  assert.doesNotMatch(page, /staged for all/);
});

test("stages each finished mockup group for its exact Etsy listing", async () => {
  const [mockups,images,page] = await Promise.all([
    readFile(new URL("../app/integrated-mockups.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/etsy/images/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(mockups, /productId/);
  assert.match(mockups, /stageForEtsy/);
  assert.match(mockups, /added automatically when this listing publishes/);
  assert.doesNotMatch(mockups, /zipSync/);
  assert.match(images, /etsy-listing-images/);
  assert.match(images, /kind==="size-guide"/);
  assert.match(page, /Add one size guide to every Etsy listing/);
  assert.match(page, /printifyImageIndices/);
});

test("renders Mockup Sets as management only", async () => {
  const response = await render("/mockups");
  const html = await response.text();
  assert.match(html, /Manage your mockup sets/);
  assert.match(html, /Add mockup set/);
  assert.match(html, /Manage here\. Create inside Listing Factory/);
  assert.doesNotMatch(html, /Add this design/);
  assert.doesNotMatch(html, /Create your mockups/);
});

test("guides sellers through the complete resumable eight-step workflow",async()=>{
  const [page,batches,route,cache]=await Promise.all([
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/batches/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/batches/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/batch-cache.ts",import.meta.url),"utf8"),
  ]);
  assert.match(page,/Connect Printify/);assert.match(page,/Choose product/);assert.match(page,/Add designs/);assert.match(page,/Review pricing/);assert.match(page,/Create drafts/);assert.match(page,/Titles \+ descriptions/);assert.match(page,/Images \+ mockups/);assert.match(page,/Final review/);
  assert.match(page,/searchParams\.get\("batch"\)/);assert.doesNotMatch(page,/const id=window\.localStorage\.getItem\("goldie-active-batch"\)/);
  assert.match(page,/aria-current=\{active\?"step"/);assert.match(page,/You are here/);assert.match(page,/Complete the prior step/);
  assert.match(page,/goldie-active-batch/);assert.match(page,/saveBatchFiles/);assert.match(page,/\/api\/batches/);
  assert.match(batches,/Pick up exactly where you left off/);assert.match(batches,/Resume batch/);assert.match(route,/listing_batches/);assert.match(cache,/indexedDB/);
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
  assert.match(page,/design\.etsy\?\.blurb,description/);
  assert.match(intelligence,/fields differ/);assert.match(intelligence,/Never fill holiday, occasion, recipient, or style/);
  assert.match(drafts,/template\.description/);
});

test("imports shipping and keeps final listing edits attached to the exact Printify draft",async()=>{
  const [page,printify,update]=await Promise.all([
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/printify/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/printify/drafts/update/route.ts",import.meta.url),"utf8"),
  ]);
  assert.match(printify,/shipping\.json/);assert.match(printify,/standardShipping/);
  assert.match(page,/Build titles for the whole batch/);
  assert.match(page,/api\/printify\/drafts\/update/);
  assert.match(page,/syncListingFields/);
  assert.match(page,/function syncPreparedListing/);
  assert.match(page,/syncedListingSignatures/);
  assert.match(update,/json_extract\(response_json,'\$\.id'\)/);
  assert.match(update,/method:"PUT"/);
  assert.match(update,/filter\(placeholder=>placeholder\.images\?\.some\(image=>image\.id\)\)/);
  assert.doesNotMatch(update,/\.\.\.area,placeholders/);
  assert.match(update,/placementScale=Math\.max/);
  assert.match(page,/draft\.placementScale\|\|templateScale/);
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
  const { recommendedPrice } = await import("../app/pricing.ts");
  const pricing = { targetProfit: 10, etsyFeePercent: 9.5, fixedFee: 0.25, listingFee: 0.20, shippingCost: 0, shippingCharged: 0 };
  assert.equal(recommendedPrice(1034, pricing), 2298);
  assert.equal(recommendedPrice(1184, pricing), 2463);
  assert.equal(recommendedPrice(1760, pricing), 3100);
  assert.equal(recommendedPrice(1034), 1034);
  assert.equal(recommendedPrice(1000, { targetProfit: 10, etsyFeePercent: 10, fixedFee: .25, listingFee: .20, shippingCost: 5, shippingCharged: 5 }), 2328);
  assert.equal(recommendedPrice(1000, { targetProfit: 10, etsyFeePercent: 9.5, fixedFee: .25, listingFee: .20, shippingCost: 6, shippingCharged: 3 }), 2623);
  assert.equal(recommendedPrice(1000, { targetProfit: 10, etsyFeePercent: 9.5, fixedFee: .25, listingFee: .20, shippingCost: 4, shippingCharged: 3 }), 2402);
  assert.equal(recommendedPrice(1000, { targetProfit: 0, etsyFeePercent: 9.5, fixedFee: .25, listingFee: .20, shippingCost: 6, shippingCharged: 3 }), 1518);
  assert.equal(recommendedPrice(1000, { targetProfit: 10, etsyFeePercent: 9.5, fixedFee: .25, listingFee: .20, shippingCost: 4, shippingCharged: 6 }), 2323);
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
  assert.match(page,/goldie-wordmark\.webp/);assert.match(page,/save-toast/);assert.match(page,/Back to Listing Factory/);
  assert.match(page,/goldie-active-batch/);assert.match(page,/Save changes/);assert.match(page,/Create another bank/);
  assert.match(route,/already exists\. Open that bank to update it instead/);
  assert.match(home,/href="\/keywords" target="_blank"/);assert.match(home,/href="\/mockups" target="_blank"/);
});

test("supports shared batch titles with collapsed per-listing keyword overrides", async()=>{
  const [page,tools]=await Promise.all([
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/factory-tools.tsx",import.meta.url),"utf8"),
  ]);
  assert.match(page,/Create a single title for this batch/);assert.match(page,/applyBatchTitle/);assert.match(page,/addBatchKeyword/);
  assert.match(page,/Create an individual title for this listing/);assert.match(page,/These keyword clicks update only this listing/);
  assert.match(page,/explicitTags\|\|tagsFromTitle\(next\)/);assert.match(page,/tags:tagsFromTitle\(title\)/);
  assert.match(page,/batchKeywords/);assert.match(page,/Matching tags were rebuilt from your validated phrases/);
  assert.match(tools,/keywordListsCache/);assert.match(tools,/compact-keywords/);
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
  assert.match(page, /goldie-wordmark\.webp/);
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
  assert.match(page, /return_to=\/mastermind|chatGPTSignInPath\("\/mastermind"\)/);
  assert.match(page, /target="_blank"/);
  assert.match(page, /noopener noreferrer/);
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

test("enforces paid-plan usage on the server and exposes honest usage", async()=>{
  const [plans,drafts,renders,library,usage]=await Promise.all([
    readFile(new URL("../app/plan-limits.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/printify/drafts/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/mockups/render/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/mockups/library/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/usage/route.ts",import.meta.url),"utf8"),
  ]);
  assert.match(plans,/price: 29, drafts: 200, aiMockups: 100, mockupSets: 10/);
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

test("shows the complete Etsy fee equation and uses the imported shipping profile", async () => {
  const [page,drafts] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/drafts/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page,/Printify product cost/);
  assert.match(page,/Domestic shipping charged by your imported profile/);
  assert.match(page,/Shipping profile imported from your Printify product/);
  assert.match(page,/Split it 50\/50/);
  assert.match(page,/Buyer pays \$\{\(referenceShipping\*\.5\)\.toFixed\(2\)\}/);
  assert.match(page,/Custom buyer shipping price/);
  assert.match(page,/Built into price/);
  assert.match(page,/Etsy % fee/);
  assert.match(page,/Fixed payment fee/);
  assert.match(page,/Listing fee/);
  assert.match(page,/Total Etsy fees/);
  assert.match(page,/Review or change Etsy fee profile/);
  assert.match(page,/copies that saved profile to every draft/);
  assert.match(drafts,/shipping_template_id:template\.shippingTemplateId/);
  assert.match(drafts,/buyerCharge=Math\.max\(0,\.\.\.Object\.values/);
  assert.match(page,/state\.shippingPercent\?\?/);
  assert.match(page,/loadTemplateUrl\(recipe\.templateUrl,nextPricing\)/);
  assert.match(page,/pricingOverride\|\|pricing/);
  assert.match(page,/Math\.max\(variant\.cost\/100/);
  assert.doesNotMatch(page,/Buyer pays Printify shipping/);
});

test("keeps management headings readable and shows the complete workflow map on phones", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css,/management-page>header h1,.usage-page>header h1\{color:#f7f0e4\}/);
  assert.match(css,/management-page \.management-nav a\.active,.usage-page \.management-nav a\.active\{color:#fff\}/);
  assert.match(css,/@media\(max-width:600px\)\{\.workflow-progress\{display:grid;grid-template-columns:repeat\(2/);
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
  const [page,oauth,callback,client,publish,finish,migration]=await Promise.all([
    readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/etsy/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/etsy/callback/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/etsy/client.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/printify/drafts/publish/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/etsy/finish.ts",import.meta.url),"utf8"),
    readFile(new URL("../drizzle/0009_etsy_connection.sql",import.meta.url),"utf8"),
  ]);
  assert.match(page,/Connect Etsy before publishing/);
  assert.match(oauth,/code_challenge_method:"S256"/);
  assert.match(oauth,/listings_r listings_w shops_r shops_w/);
  assert.match(callback,/grant_type:"authorization_code"/);
  assert.match(client,/grant_type:"refresh_token"/);
  assert.match(client,/ETSY_API_SECRET/);
  assert.match(publish,/waitForEtsyListing/);
  assert.match(publish,/product\.external\?\.id/);
  assert.doesNotMatch(publish,/sort_on|newest|title.*match/i);
  assert.match(finish,/listing\.shop_id/);
  assert.match(finish,/Goldie stopped without editing it/);
  assert.match(finish,/applyEtsyDetails/);
  assert.match(finish,/applyListingImages/);
  assert.doesNotMatch(finish,/body\.set\("title"/);
  assert.match(migration,/etsy_connections/);
  assert.match(migration,/etsy_listing_links/);
});
