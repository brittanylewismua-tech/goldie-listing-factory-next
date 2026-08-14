import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the branded Listing Factory", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Goldie Listing Factory/);
  assert.match(html, /From finished designs to listing-ready drafts, in one workflow\./);
  assert.match(html, /Secure workspace/);
  assert.doesNotMatch(html, /Private workspace/);
  assert.match(html, /Your Printify account/);
  assert.match(html, /Choose a saved recipe or build a new one/);
  assert.match(html, /Printify template link/);
  assert.match(html, /paste it only once/);
  assert.match(html, /Default title structure/);
  assert.doesNotMatch(html, /factory-switcher/);
  assert.match(html, /Add your finished designs/);
  assert.match(html, /Choose individual images/);
  assert.match(html, /already be upscaled/);
  assert.match(html, /transparent-background PNG/);
  assert.match(html, /Connect Printify first/);
  assert.match(html, /20 finished designs/);
  assert.match(html, /500 MB/);
  assert.match(html, /sized for the selected product/);
  assert.match(html, /Listings remain unpublished/);
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
  assert.match(page, /MAX_BATCH_BYTES = 500 \* 1024 \* 1024/);
  assert.doesNotMatch(page, /new Worker|createImageBitmap|OffscreenCanvas|canvas|getImageData|UPNG/);
  assert.match(page, /MAX_CONCURRENT_DESIGNS = 2/);
  assert.match(page, /\$\{processed\} of \$\{runTotal\} complete/);
  assert.match(page, /\{processed\}\/\{runTotal\}/);
  assert.doesNotMatch(page, /Creating \$\{processed \+ 1\} of/);
  assert.match(page, /\/api\/printify\/stage/);
  assert.match(page, /pass its original bytes straight through/);
  assert.match(page, /return \{ blob: file, fileName: file\.name \}/);
  assert.match(page, /fetchWithDeadline/);
  assert.match(page, /4 \* 60 \* 1000/);
  assert.match(page, /Add at least one design/);
  assert.match(page, /title: design\.title \|\| listingTitle\.trim\(\) \|\| undefined/);
  assert.match(route, /body\.title\?\.trim\(\)\.slice\(0, 255\) \|\| body\.fileName/);
  assert.match(page, /Choose or verify a product recipe/);
  assert.match(page, /function startOver\(\)/);
  assert.match(page, /Clear all \/ start over/);
  assert.match(page, /folderPicker\.current\.value = ""/);
  assert.match(page, /imagePicker\.current\.value = ""/);
  assert.match(page, /function openAllDrafts\(\)/);
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

test("unifies recipes, listing editing, pricing, and mockups without the old factory toggle", async () => {
  const [page, recipes, mockups, drafts] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/factory-tools.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/integrated-mockups.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/drafts/route.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(page, /factory-switcher/);
  assert.match(recipes, /Printify template link/);
  assert.match(recipes, /paste it only once/);
  assert.match(recipes, /saved recipe/);
  assert.match(recipes, /Add another recipe/);
  assert.match(recipes, /Save as my default pricing profile/);
  assert.match(page, /Import title CSV/);
  assert.match(page, /Exact title phrases/);
  assert.match(page, /300 DPI recommended/);
  assert.match(page, /Choose Printify flatlays/);
  assert.match(page, /IntegratedMockups/);
  assert.match(mockups, /Choose a mockup set/);
  assert.match(mockups, /Create .*mockups/);
  assert.match(drafts, /priceFor\(cost \?\? price\)/);
  assert.match(drafts, /printifyImages/);
});

test("matches Printify editor DPI instead of comparing against template pixel dimensions", async () => {
  const { printifyDpi } = await import("../app/print-quality.ts");
  assert.deepEqual(printifyDpi(5000, 7200, 1.126), { dpi: 185, level: "Medium" });
  assert.deepEqual(printifyDpi(8100, 7200, 1.125), { dpi: 300, level: "High" });
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /Target:\s*\{templateDetails/);
  assert.match(page, /DPI in Printify/);
});

test("processes a 20-design batch with bounded two-at-a-time concurrency", async () => {
  const [page, boundedSource] = await Promise.all([readFile(new URL("../app/page.tsx", import.meta.url), "utf8"), readFile(new URL("../app/bounded-work.ts", import.meta.url), "utf8")]);
  assert.match(page, /const MAX_BATCH_FILES = 20/);
  assert.match(page, /const MAX_CONCURRENT_DESIGNS = 2/);
  assert.match(page, /async function processDesign/);
  assert.match(page, /runBounded\(targetFiles, MAX_CONCURRENT_DESIGNS, processDesign/);
  assert.match(page, /setProcessed\(\(current\) => current \+ 1\)/);
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
  assert.match(connection, /no enabled sizes or colors/);
  assert.match(connection, /placeholder design to every print area/);
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

test("sends private staged artwork directly to Printify without a public callback", async () => {
  const route = await readFile(new URL("../app/api/printify/drafts/route.ts", import.meta.url), "utf8");
  assert.match(route, /ARTWORK\?\.get\(body\.stagedId\)/);
  assert.match(route, /contents = await artworkContents/);
  assert.match(route, /contents \}\)/);
  assert.doesNotMatch(route, /signedArtworkUrl|url: artworkUrl/);
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
  assert.match(route,/DAILY_LIMIT/);
  assert.match(renderers,/fashn\/tryon\/v1\.6/);
  assert.match(renderers,/model_image:scene/);
  assert.match(renderers,/garment_image:reference/);
  assert.doesNotMatch(renderers,/shirt-design/);
  assert.match(renderers,/seedream\/v5\/lite\/edit/);
});
