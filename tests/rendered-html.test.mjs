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
  assert.match(html, /Automate your Printify listing creation process, all in one place\./);
  assert.match(html, /Secure workspace/);
  assert.doesNotMatch(html, /Private workspace/);
  assert.match(html, /Your Printify account/);
  assert.match(html, /Choose your Printify product template/);
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
  assert.match(page, /Edit in Printify/);
  assert.match(page, /openedDrafts/);
  assert.match(page, /\/app\/store\/\$\{draft\.shopId\}\/products\/1/);
  assert.doesNotMatch(page, /openLatestBatch|Open .* drafts in Printify/);
  assert.match(route, /shopId: shop\.id/);
  assert.match(page, /MAX_BATCH_FILES = 20/);
  assert.match(page, /MAX_BATCH_BYTES = 500 \* 1024 \* 1024/);
  assert.match(page, /templateDetails\.maxPrintWidth \/ bitmap\.width/);
  assert.match(page, /const activeItem = running \? Math\.min\(processed \+ 1, files\.length\) : processed/);
  assert.match(page, /Creating \$\{activeItem\} of \$\{files\.length\}/);
  assert.match(page, /\{activeItem\}\/\{files\.length\}/);
  assert.doesNotMatch(page, /Creating \$\{processed \+ 1\} of/);
  assert.match(page, /95 \* 1024 \* 1024/);
  assert.match(page, /\/api\/printify\/stage/);
  assert.match(page, /UPNG\.encode/);
  assert.match(page, /Add at least one design/);
  assert.match(page, /Load your product template/);
  assert.match(page, /function startOver\(\)/);
  assert.match(page, /Clear all \/ start over/);
  assert.match(page, /folderPicker\.current\.value = ""/);
  assert.match(page, /imagePicker\.current\.value = ""/);
  assert.match(page, /function openAllDrafts\(\)/);
  assert.match(page, /Open all in Printify/);
  assert.ok(page.indexOf("drafts.map") < page.indexOf("Open all in Printify"));
  assert.match(page, /Allow pop-ups for this site/);
  assert.match(route, /response\.status === 429/);
  assert.match(route, /response\.status >= 500/);
  assert.match(route, /three automatic retries/);
  assert.match(page, /clientId: design\.id/);
  assert.match(page, /failedIds\.has\(file\.id\)/);
  assert.match(page, /key=\{draft\.clientId\}/);
  assert.doesNotMatch(page, /\.tif|tiff\?/i);
  assert.match(page, /Open help/);
  assert.match(page, /all access scopes/);
  assert.match(page, /printify\.com\/app\/account\/connections/);
  assert.match(page, /friendlyUploadError/);
  assert.match(page, /8253\|Provided images do not exist/);
  assert.match(page, /Download it fully to your computer/);
  assert.match(page, /const waits = \[0, 1500, 4000\]/);
  assert.match(route, /stagedIdForCleanup/);
  assert.match(route, /finally/);
  assert.match(route, /primaryTemplateImageId/);
  assert.match(route, /image\.id === primaryTemplateImageId/);
  assert.match(route, /Add one placeholder design/);
  assert.match(route, /placeholder\.images\?\.length/);
  assert.match(route, /area\.placeholders\.length > 0/);
});

test("Printify image processing is confirmed and error 8253 is retried server-side", async () => {
  const route = await readFile(new URL("../app/api/printify/drafts/route.ts", import.meta.url), "utf8");
  assert.match(route, /waitForUploadedImage\(upload\.id, token\)/);
  assert.match(route, /\/uploads\/\$\{encodeURIComponent\(imageId\)\}\.json/);
  assert.match(route, /Provided images do not exist/);
  assert.match(route, /8253/);
  assert.match(route, /createProductAfterImageIsReady/);
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
  assert.match(chat, /supportResponse\(clean,current\)/);
  assert.match(chat, /Contact Support/);
  assert.match(chat, /Screenshot of the error/);
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
});

test("revalidates saved Printify tokens instead of showing a false connection", async () => {
  const route = await readFile(new URL("../app/api/printify/route.ts", import.meta.url), "utf8");
  assert.match(route, /await printify<Shop\[\]>\("\/shops\.json", token\)/);
  assert.match(route, /expired or was revoked/);
  assert.match(route, /DELETE FROM printify_connections WHERE user_id = \?/);
});
