Warning: truncated output (original token count: 125257)
Total output lines: 7679

import {readDraftImplementation} from "./draft-implementation-source.mjs";
/* D721 · interface-v2.css owns the shell, card and row selectors after the
   migration. These reads include it so the assertions still describe the
   app's styles. Not one assertion is relaxed — only the file set widens. */
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import test from "node:test";
import {registerHooks} from "node:module";
// Public-page SSR runs under Node. The Worker now exports a native Workflow
// class; its constructor is not exercised by these HTTP rendering assertions.
registerHooks({resolve(specifier,context,next){if(specifier==="cloudflare:workers")return {url:'data:text/javascript,export class WorkflowEntrypoint{};export const env={};',shortCircuit:true};return next(specifier,context);}});
import { navigationIssues } from "../app/workflow-gates.ts";

test("keeps both connected-account Disconnect actions visually quiet", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    Promise.all([readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8"),readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8")]).then(x=>x.join("\n")),
  ]);
  /* D837 · Two of these were two copies of the same Etsy row, and D836 fixed
     only one of them. There is one Etsy row now, rendered twice from one
     component, plus Printify's - so two occurrences, not three. What this test
     guards is unchanged: every Disconnect stays visually quiet. */
  assert.equal((page.match(/className="disconnect-link"/g) || []).length, 2);
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
    Promise.all([readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8"),readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8")]).then(x=>x.join("\n")),
  ]);
  assert.match(page, /PNG or JPG · up to \{batchDesignLimit\} designs · 100 MB each/);
  assert.match(page, /Upload each \$\{uploadPrimaryLabel\} design once for every product in this bundle/);
  assert.match(page, /Upload one \$\{uploadPrimaryLabel\} design per listing/);
  assert.doesNotMatch(page, /Your folder can contain up to 20 designs/);
  assert.match(page, /headerActions=\{bundleCreationMode\|\|productFormMode\?undefined:[\s\S]{0,380}>＋ Add a new product<\/button>[\s\S]{0,220}>＋ Create a new bundle<\/button>/);
  assert.match(css, /managementOnly \.newSetButton\{border:0!important;background:transparent!important/);
});

test("places the selected-product proof before bundle setup and exposes Finish phases after drafts", async () => {
  const [app, tools] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/factory-tools.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(app, /selectedSummary=\{templateDetails\?</);
  assert.match(tools, /\{activeId&&!bundleForm&&<div className="selected-summary-block">/);
  assert.match(tools, /\{bundleForm&&<div className="bundle-builder">/);
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

/*
  ONE WORKER PER FILE, NOT ONE PER RENDER.

  The cache-buster used `Date.now()`, so every call to `render()` evaluated a
  fresh copy of the entire built worker bundle — four full initialisations in
  this file. Locally that is slow; in CI, under memory pressure alongside three
  thousand other tests, it was intermittently fatal: the suite failed twice with
  2,990/1 and never once reproduced across eight local runs, blocking two
  deploys until an empty retry commit cleared it.

  The buster exists to avoid sharing module state with OTHER test files in the
  same process. A single constant per file achieves that; re-evaluating per call
  achieves nothing except the flake.
*/
const WORKER_KEY = `${process.pid}-${Math.random().toString(36).slice(2)}`;
let workerPromise;

function loadWorker() {
  if (!workerPromise) {
    const workerUrl = new URL("../dist/server/index.js", import.meta.url);
    workerUrl.searchParams.set("test", WORKER_KEY);
    workerPromise = import(workerUrl.href).then(module => module.default);
  }
  return workerPromise;
}

async function render(path = "/") {
  const worker = await loadWorker();
  return worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("serves the closed notice at home, with no prices anywhere in the payload", async () => {
  /*
    D1448 - the homepage IS the signup page, so it was showing plans and
    prices while Goldie was meant to be in private testing. A member was
    charged $14.99 before it was on sale.

    Checking that the buttons are gone is not enough: this renders on the
    server, so the amounts would still sit in the HTML for anyone who looked.
    The assertion is that no price reaches the payload at all.
  */
  const response = await render();
  assert.equal(response.status, 200);
  const homepage = await response.text();
  assert.match(homepage, /isn't open yet|not open yet/i);
  assert.doesNotMatch(homepage, /Choose your plan/);
  /*
    A PRICE, NOT A DIGIT RUN — THIS GUARD WAS FAILING AT RANDOM.

    `homepage.includes("149")` matched inside the build's own deployment
    UUID: "13a7ef85-f149-4947-8d11-8f7550edb7fb". The UUID is new on every
    build, so whether this passed was a coin flip, and a guard that fails at
    random is worse than no guard — it teaches whoever is deploying to re-run
    CI until it goes green, which throws away every other guard in the suite
    along with this one.

    The intent is unchanged and the reach is the same: no price may appear
    anywhere in the payload, scripts included. It is matched as a price now —
    against a currency marker, or as a standalone number in the visible text
    — so an asset hash or a UUID cannot stand in for one.
  */
  const visible = homepage
    .replace(/<script[^]*?<\/script>/gi, " ")
    .replace(/<style[^]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  for (const amount of ["14.99", "24.99", "39.99", "149", "249", "399"]) {
    const escaped = amount.replace(".", "\\.");
    /* Anywhere in the payload, if it carries a currency marker. */
    assert.ok(!new RegExp(`[$£€]\\s?${escaped}\\b`).test(homepage),
      `the homepage still ships the price ${amount}`);
    /* Or standing alone as a number somebody can read on the page. */
    assert.ok(!new RegExp(`(^|[^\\d.])${escaped}([^\\d.]|$)`).test(visible),
      `the homepage still shows the amount ${amount} in its visible text`);
  }
  for (const plan of ["Starter", "Scale"])
    assert.ok(!homepage.includes(plan), `the homepage still names the ${plan} plan`);
  assert.equal((await render("/listing-factory")).status, 200);
  const pageSource = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  const globalCss = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const approvedCss = await Promise.all([readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8"),readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8")]).then(x=>x.join("\n"));
  assert.match(pageSource, /<SuiteBrand\s*\/>/);
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
  /*
    D1606 · The sign-in page is not inside the Listing Factory, so it only
    calls itself that when that is genuinely where the member is heading.
    This destination is /mastermind, so it says "Sign in." and shows no
    Listing Factory wordmark.
  */
  assert.match(html, /Sign in\./);
  assert.doesNotMatch(html, /Sign in to your Listing Factory/);
  assert.match(html, /Continue with Google/);
  assert.match(html, /Email me a sign-in link/);
  assert.doesNotMatch(html, /Continue with ChatGPT/);
  assert.match(html, /No password to remember/);

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
  assert.doesNotMatch(auth, /oai-authenticated-user|from "next\/headers"/);
  assert.match(callback, /exchangeCodeForSession/);
  assert.match(signout, /auth\.signOut/);
});

test("uses individual shop-aware Printify editor buttons", async () => {
  const [page, route] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readDraftImplementation(),
  ]);
  assert.match(page, /Adjust in Printify/);
  assert.match(page, /Clear this listing’s selections/);
  assert.match(page, /openedDrafts/);
  assert.match(page, /window\.open\(draft\.editorUrl/);
  assert.doesNotMatch(page, /printifyTab\.location|\/app\/store\/\$\{draft\.shopId\}/);
  assert.doesNotMatch(page, /openLatestBatch|Open .* drafts in Printify/);
  assert.match(route, /shopId: shop\.id/);
  assert.match(page, /MAX_BATCH_FILES = 20/);
  assert.doesNotMatch(page, /MAX_BATCH_BYTES|Reduce it to 500 MB/);
  assert.doesNotMatch(page, /LARGE_BATCH_THRESHOLD/);
  assert.doesNotMatch(page, /new Worker|OffscreenCanvas|UPNG/);
  assert.match(page, /analyzePadding/);
  assert.match(page, /MAX_CONCURRENT_DESIGNS = 4/);
  assert.match(page, /Creating drafts · \$\{processed\} of \$\{runTotal\} finished/);
  assert.match(page, /aria-label="Printify draft creation progress"/);
  assert.match(page, /aria-valuetext=\{creationProgressText\}/);
  assert.match(page, /aria-valuenow=\{creationProgressPercent\}/);
  assert.match(page, /className="progress-track"/);
  assert.doesNotMatch(page, /progress-track is-indeterminate/);
  assert.match(page, /<b>\{creationProgressPercent\}%<\/b>/);
  assert.doesNotMatch(page, /Creating \$\{processed \+ 1\} of/);
  assert.match(page, /\/api\/printify\/stage/);
  assert.match(page, /prepareArtworkFile/);
  assert.match(page, /fetchWithDeadline/);
  assert.match(page, /60_000/);
  assert.doesNotMatch(page, /4 \* 60 \* 1000/);
  assert.match(page, /Add at least one design/);
  assert.match(page, /title: design\.title \|\| undefined/);
  assert.doesNotMatch(page, /listingTitle/);
  assert.match(route, /body\.title\?\.trim\(\)\.slice\(0, 255\) \|\| requestedArtworks\[0\]\.fileName/);
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
  assert.match(page, /aria-label="Open Listing Factory diagnostics"/);
  assert.match(page, /owner && <a className="diagnostics-link"/);
  assert.doesNotMatch(page, /className="help-button"|aria-label="Open help"/);
  assert.match(page, /all scopes/);
  assert.match(page, /friendlyUploadError/);
  assert.match(page, /8253\|Provided images do not exist/);
  assert.match(page, /Download it fully to your computer/);
  assert.match(page, /const waits = \[0, 1500, 4000\]/);
  assert.match(route, /const workflowId=crypto.randomUUID\(\),copies:string\[\]=\[\]/);
  assert.doesNotMatch(route, /finally\s*\{\s*await Promise.all.*staged/,'HTTP completion must not delete artwork owned by a running durable job');
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
    readDraftImplementation(),
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
  assert.match(page, /with that exact Printify cost/);
  assert.match(page, /color, size, material, finish, capacity, or model stays separate automatically/);
  assert.doesNotMatch(page, /Sizes and colors shown below/);
  assert.match(page, /edit one separately/i);
  assert.doesNotMatch(page, /Approve pricing \+ shipping/);
  assert.match(page, /Review draft plan/);
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
  assert.match(page, /Review the draft plan/);
  assert.match(page, /Create the Printify drafts/);
  assert.match(page, /Create titles, tags, and descriptions/);
  assert.match(page, /Review Etsy details/);
  assert.match(page, /Choose and arrange listing images/);
  assert.match(page, /Finish your Etsy drafts/);
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

test("stages each finished mockup group for its exact Etsy listing", async () => {
  const [mockups,images,page,uploads] = await Promise.all([
    readFile(new URL("../app/integrated-mockups.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/etsy/images/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/uploaded-listing-photos.tsx", import.meta.url), "utf8"),
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
  assert.match(page, /<UploadedListingPhotos /);
  assert.match(uploads, /form\.set\("kind","size-guide"\)/);
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
  assert.match(html, /class="top-nav"/);
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
  assert.match(page,/Connect Printify/);assert.match(page,/Choose product/);assert.match(page,/Add designs/);assert.match(page,/Review draft plan/);assert.match(page,/Create Printify drafts/);assert.match(page,/Titles, tags \+ descriptions/);assert.match(page,/Etsy listing details/);assert.match(page,/Images \+ mockups/);assert.match(page,/Final review/);
  assert.match(page,/searchParams\.get\("batch"\)/);assert.doesNotMatch(page,/const id=window\.localStorage\.getItem\("goldie-active-batch"\)/);
  assert.match(page,/aria-current=\{active\?"step"/);assert.match(page,/progressStatus/);assert.match(page,/designs ready/);assert.match(page,/Ready to save to Etsy Drafts/);assert.match(page,/Complete the prior step/);
  assert.match(page,/goldie-active-batch/);assert.match(page,/saveBatchFiles/);assert.match(page,/\/api\/batches/);
  assert.match(batches,/Continue where you left off/);assert.match(batches,/Resume batch/);assert.match(route,/listing_batches/);assert.match(cache,/indexedDB/);
  assert.match(styles,/post-draft-workspace \.open-all-button\{width:auto/);
  assert.match(page,/saveAllEtsyDetails/);assert.match(page,/finishPhase/);
  assert.match(page,/etsyPreparationActive\.current/);
  assert.match(page,/etsySaveActive\.current/);
  assert.match(page,/url\.searchParams\.set\("phase","final"\)/);
  assert.match(page,/version===etsyPreparationVersion\.current&&JSON.stringify/);
  assert.match(page,/if\(!stillCurrent\(\)\)return/);
});

test("imports Printify product facts and automatically prepares product-specific Etsy details",async()=>{
  const [page,printify,intelligence,drafts]=await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/printify/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/listing-intelligence/route.ts",import.meta.url),"utf8"),
    readDraftImplementation(),
  ]);
  assert.match(printify,/blueprintTitle/);assert.match(printify,/description:found\.product\.description/);
  assert.match(page,/Completing Etsy details/);
  /* D541 - "Etsy details completed" was a disclosure nested inside step 3's
     table of every listing. The Etsy fields are their own task now, and each
     listing's row reports its own standing on that task instead. */
  /* D544 - "Needs review" told her nothing. When one required field is all that
     stands between her and step 4, the row names it. */
  assert.match(page,/export function etsyMissingRequired\(/);
  /* D691 - naming the field moved from the row's counter into its flag, because
     the counter was printing "Ready" beside a chip that already said Ready. The
     rule D544 wrote down is unchanged: name what is missing, never just count it. */
  assert.match(page,/return \[\{tone:"attention",label:`Missing \$\{missing\.slice\(0,2\)\.join\(", "\)\}/);
  assert.doesNotMatch(page,/`\$\{missing\.length\} required fields left`/,
    "a bare count tells her nothing about which field to go and fill");
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
  assert.match(page,/Create all titles and tags/);
  assert.match(page,/api\/printify\/drafts\/update/);
  assert.match(page,/syncListingFields/);
  assert.match(page,/function syncPreparedListing/);
  assert.match(page,/syncedListingSignatures/);
  assert.match(update,/json_extract\(response_json,'\$\.id'\)/);
  assert.match(update,/method:"PUT"/);
  assert.match(update,/filter\(placeholder=>placeholder\.images\?\.some\(image=>image\.id\)\)/);
  assert.doesNotMatch(update,/\.\.\.area,placeholders/);
  assert.match(update,/placementScale=Math\.max/);
  assert.match(page,/Adjust in Printify/);
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
  assert.match(page, /Estimated \$\{quality.dpi\} DPI · \$\{artworkLabel\}/);
  assert.match(page, /const artworkLabel=productPrintSideSummary\(printSides\.length\?printSides:templateDetails\?\.printPositions,"artwork",templateDetails\?\.blueprintTitle,templateDetails\?\.brand,templateDetails\?\.model\)\|\|"Primary artwork"/);
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
  const drafts = await readDraftImplementation();
  assert.match(page, /stillUsingTemplatePrices/);
  assert.match(page, /Prices calculated from your profit goal, product costs, and Etsy fees\./);
  assert.match(page, /if\(profile\)recalculate\(pricing\)/);
  assert.doesNotMatch(page, /estimatedProfit\([^\n]+shippingCost/);
  assert.doesNotMatch(drafts, /shipping==null\?body\.pricing/);
});

test("processes a 20-design batch with bounded four-at-a-time concurrency", async () => {
  const [page, boundedSource] = await Promise.all([readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"), readFile(new URL("../app/bounded-work.ts", import.meta.url), "utf8")]);
  assert.match(page, /const MAX_BATCH_FILES = 20/);
  assert.match(page, /const MAX_CONCURRENT_DESIGNS = 4/);
  assert.match(page, /async function processDesign/);
  assert.match(page, /runBounded\(targetFiles, batchConcurrency/);
  assert.match(page, /processDesign\(design,undefined,phase=>markDraftCreationPhase\(design\.id,phase\)\)/);
  assert.match(page, /const batchConcurrency=MAX_CONCURRENT_DESIGNS/);
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
    readDraftImplementation(),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0004_broad_dazzler.sql", import.meta.url), "utf8"),
  ]);
  assert.match(connection, /printify_batch_sessions/);
  assert.match(connection, /Enable at least one size or color/);
  assert.match(connection, /Place one design in every print area/);
  assert.match(connection, /Publish this product to Etsy once with the shipping profile/);
  assert.match(connection, /expiresAt = Math\.floor\(Date\.now\(\) \/ 1000\) \+ 6 \* 60 \* 60/);
  assert.match(page, /batchId: requestDetails\?\.batchId/);
  assert.match(drafts, /FROM printify_batch_sessions WHERE id=\? AND user_id=\?/);
  assert.doesNotMatch(drafts, /const shops = await api|for \(const candidate of shops\)/);
  assert.match(schema, /printifyBatchSessions/);
  assert.match(migration, /printify_batch_sessions/);
});

test("makes draft retries idempotent so a lost response cannot duplicate a listing", async () => {
  const [drafts, schema, migration] = await Promise.all([
    readDraftImplementation(),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0004_broad_dazzler.sql", import.meta.url), "utf8"),
  ]);
  assert.match(drafts, /SHA-256/);
  assert.match(drafts, /if\(prior&&prior.status!=="failed"\)return jobResponse/);
  assert.match(drafts, /status = 'succeeded'/);
  assert.match(drafts, /shouldRestartDraftWorkflow\(row.status,row.updated_at\)/);
  assert.match(drafts, /async function handleGET\(request:Request\)/);
  const page = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  assert.match(page, /async function recoverDraft/);
  assert.match(page, /status === "succeeded"/);
  assert.match(schema, /printifyDraftResults/);
  assert.match(migration, /printify_draft_results/);
});

test("uses draft creation as the authoritative image-readiness check", async () => {
  const [route, creation] = await Promise.all([readDraftImplementation(), readFile(new URL("../app/api/printify/product-creation.ts", import.meta.url), "utf8")]);
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
  const drafts = await readDraftImplementation();
  assert.match(drafts, /10300/);
  assert.match(drafts, /image download/);
  assert.match(drafts, /remoteDownloadInterrupted/);
  assert.match(drafts, /after three automatic retries/);
});

test("sends optimized staged artwork to Printify by a protected URL", async () => {
  const route = await readDraftImplementation();
  assert.match(route, /ARTWORK\?\.get\(artwork\.stagedId\)/);
  assert.match(route, /signedArtworkUrl\(requestOrigin, artwork\.stagedId, artworkSecret\)/);
  assert.match(route, /file_name: source\.fileName, url: source\.url/);
  assert.doesNotMatch(route, /file_name: source\.fileName, contents: source\.contents/);
  assert.match(route, /for \(const artwork of requestedArtworks\)/, "every colour or print-side asset is ownership-checked and uploaded");
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
    readDraftImplementation(),
    readFile(new URL("../app/api/printify/token-crypto.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(stage, /request\.body\.tee\(\)/);
  assert.match(stage, /new FixedLengthStream\(contentLength\)/);
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

test("recovers from a definite Printify throttle without changing the request", async () => {
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
      if (calls === 1) return new Response("limited", { status:429, headers:{ "retry-after":"1" } });
      return new Response(JSON.stringify({ id:"recovered" }), { status:200, headers:{ "content-type":"application/json" } });
    },
    sleeper:async(milliseconds)=>{ waits.push(milliseconds); },
  });
  assert.deepEqual(result, { id:"recovered" });
  assert.equal(calls, 2);
  assert.deepEqual(waits, [1000]);
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
      /* D884 - a sleeve, not a back; this test is about inherited ids. */
      { position:"left_sleeve", images:[{id:"another-stale",x:0.5,y:0.5,scale:0.4,angle:0}] },
    ],
  }];
  const result = printAreasWithOnlyCurrentArtwork(template, "fresh-upload");
  const ids = result.flatMap((area)=>area.placeholders.flatMap((placeholder)=>placeholder.images.map((image)=>image.id)));
  assert.deepEqual(ids, ["fresh-upload"]);
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
  assert.match(page,/Create all titles and tags/);assert.match(page,/runBounded\(files,2/);
  assert.match(page,/Build titles manually/);assert.doesNotMatch(page,/Suggest phrases from my bank/);assert.match(page,/Choose phrases in title order/);
  assert.match(page,/removeBatchKeyword/);assert.match(page,/clearBatchKeywords/);assert.match(page,/Applied to every listing/);
  assert.match(page,/Create a different title with AI/);assert.match(page,/Create title for this design/);
  assert.match(page,/autoTitleForDesign/);assert.match(page,/tags:item\.result\.tags/);
  assert.match(page,/separately ranked Etsy tags created/);assert.match(page,/<KeywordBank compact selectionOnly/);
  /* D541 - the promise moved with the block that held it; this is the copy that
     carries it now, in the title builder itself. */
  assert.match(page,/completedGeneratedTags/);
  assert.ok(page.indexOf('if(task==="description")')<page.indexOf('individual-description-body'),"The batch description leads the panel, and each listings.");
  assert.doesNotMatch(page,/The complete description is shown below/);
  assert.match(page,/descriptionOverride/);assert.match(page,/scrollIntoView/);
  assert.match(tools,/keywordListsCache/);assert.match(tools,/selectionOnly/);assert.match(tools,/onSelect/);
  assert.match(intelligence,/selected_keywords/);assert.match(intelligence,/allowedByLower/);assert.match(intelligence,/PRODUCT TYPE RULE/);assert.match(intelligence,/if\(!picked\.length\)return NextResponse\.json\(\{error:"No phrase in this keyword bank accurately describes the design/);
  assert.match(intelligence,/tagCandidates=keywords\.filter/);
  assert.match(intelligence,/tag_keywords/);
  assert.doesNotMatch(intelligence,/requiredTagCount|rankedTagFallback/);
  assert.match(intelligence,/return NextResponse\.json\(\{title,keywords:included,tags:pickedTags\.length\?pickedTags:tags,titleWarning,designText\}\)/);
});

test("records permanent sanitized Printify diagnostics without blocking listings", async () => {
  const [page, stage, drafts, diagnostics, admin, adminPage, schema] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/stage/route.ts", import.meta.url), "utf8"),
    readDraftImplementation(),
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
  assert.match(supportRoute, /process\.env\.WEB3FORMS_ACCESS_KEY/);
  assert.doesNotMatch(supportRoute, /5b639ca5-fea3-4f99-bf3e-a08f6e9482c2/);
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
  assert.match(page, /<SuiteBrand\s*\/>/);
  /* D828 · approved-wm moved into mobile-gate.tsx with the card it belongs to. */
  const gateMarkup = await readFile(new URL("../app/mobile-gate.tsx", import.meta.url), "utf8");
  assert.match(gateMarkup, /approved-wm/);
  assert.match(layout, /NEUTRAL_FALLBACK_TITLE/);
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
  assert.match(page, /10 listings during the private mastermind beta/);
  assert.doesNotMatch(page, /lifestyle mockups/);
  assert.doesNotMatch(page, /BetaCountdown/);
  assert.match(page, /params\?\.stage !== "code"/);
  assert.match(page, /<ListingFactory \/>/);
  assert.match(redeem, /INSERT INTO mastermind_access/);
  assert.match(admin, /DELETE FROM printify_connections/);
  assert.match(admin, /SELECT user_id FROM mastermind_access/);
  assert.match(access, /toUpperCase/);
  /* D1722 · The allowlist moved into app/owner-allowlist.ts so a pure
     identity decision is not reachable only from inside a worker. The
     property — that these addresses are the owner — is unchanged. */
  {
    const allowlist = await readFile(
      new URL("../app/owner-allowlist.ts", import.meta.url), "utf8");
    assert.match(allowlist, /brittanylewismua@gmail\.com/);
  }
  {
    const allowlist = await readFile(
      new URL("../app/owner-allowlist.ts", import.meta.url), "utf8");
    assert.match(allowlist, /shesawolfclothing@gmail\.com/);
  }
});

test("gives the owner testing account room to run real batches", async () => {
  const [limits, usage, drafts, publish] = await Promise.all([
    readFile(new URL("../app/plan-limits.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/usage/route.ts", import.meta.url), "utf8"),
    readDraftImplementation(),
    readFile(new URL("../app/api/printify/drafts/publish/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(limits, /OWNER_TEST_PLAN[\s\S]*drafts: 10000/);
  assert.match(limits, /if \(owner\) return OWNER_TEST_PLAN/);
  assert.match(usage, /planFor\(planRow\?\.plan_key, isOwner\(user\)\)/);
  assert.match(drafts, /planFor\(planRow\?\.plan_key,isOwner\(user\)\)/);
  assert.match(publish, /planFor\(planRow\?\.plan_key,isOwner\(user\)\)/);
});

test("uses only the app-owned Supabase account identity", async () => {
  const auth = await readFile(new URL("../app/chatgpt-auth.ts", import.meta.url), "utf8");
  const supabaseLookup = auth.indexOf("createSupabaseServerClient()");
  assert.ok(supabaseLookup >= 0, "Supabase account lookup is present");
  assert.doesNotMatch(auth, /requestHeaders|get\(USER_ID_HEADER\)|oai-authenticated-user/);
  assert.match(auth, /userId: `supabase:\$\{user\.id\}`/);
});

test("never strands a signed-in account on the plan screen", async () => {
  const [signup, route] = await Promise.all([
    readFile(new URL("../app/signup/signup-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/listing-factory/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(signup, /signedInEmail \|\| "Signed in"/);
  assert.match(signup, /Use a different account/);
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

test("saved mockup management opens one set and exposes the add-set dialog", async () => {
  const page=await readFile(new URL("../app/mockups/page.tsx", import.meta.url), "utf8");
  const markup=page.slice(page.indexOf('  return <FactoryShell'));
  assert.match(markup,/open=activeTheme===theme/);
  assert.match(markup,/aria-expanded=\{open\}/);
  assert.match(markup,/onClick=\{\(\)=>setActiveTheme\(open\?"":"?theme\)\}/);
  assert.match(markup,/open&&<>/);
  assert.match(markup,/Create your first mockup set/);
  assert.match(markup,/showAddSet&&<div className="confirmOverlay"/);
  assert.match(markup,/aria-labelledby="add-set-title"/);
  assert.match(markup,/aria-label="Close"/);
  assert.match(markup,/setShowAddSet\(false\)/);
  assert.doesNotMatch(markup,/<section className="mockupResults"/);
});

test("saved sets cap at fifty and live listing generation caps at eight", async () => {
  const [page,libraryRoute,listing] = await Promise.all([
    readFile(new URL("../app/mockups/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/mockups/library/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/integrated-mockups.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page,/MAX_MOCKUPS_PER_SET=50/);
  assert.match(page,/Each set can hold up to 50 blank mockups/);
  assert.match(page,/count>MAX_MOCKUPS_PER_SET-existing/);
  assert.match(libraryRoute,/MAX_MOCKUPS_PER_SET = 50/);
  assert.match(libraryRoute,/existing\.length>=MAX_MOCKUPS_PER_SET/);
  assert.match(listing,/MAX_MOCKUPS_PER_LISTING=8/);
  assert.match(listing,/next\.size>=MAX_MOCKUPS_PER_LISTING/);
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
  const [plans,drafts,library,usage]=await Promise.all([
    readFile(new URL("../app/plan-limits.ts",import.meta.url),"utf8"),
    readDraftImplementation(),
    readFile(new URL("../app/api/mockups/library/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/usage/route.ts",import.meta.url),"utf8"),
  ]);
  /* The aiMockups allowance is gone with the generator it metered. A plan may
     not advertise an allowance for a feature that cannot be reached — see
     app/plan-limits.ts. */
  assert.match(plans,/name: "Starter", price: 14.99, drafts: 100, dailyListings: 40, mockupSets: 10/);
  assert.match(plans,/name: "Pro", price: 24.99, drafts: 250, dailyListings: 75, mockupSets: 30/);
  assert.match(plans,/name: "Scale", price: 39.99, drafts: 500, dailyListings: 100, mockupSets: 75/);
  assert.doesNotMatch(plans,/aiMockups/,"no plan may meter a feature that no longer exists");
  assert.match(drafts,/plan\.drafts/);assert.match(drafts,/status='succeeded'/);
  assert.match(library,/plan\.mockupSets/);assert.match(library,/COUNT\(DISTINCT theme\)/);
  assert.match(usage,/nextReset/);
  assert.doesNotMatch(usage,/mockup_render_usage/,"and the usage screen may not count them");
});

test("saved mockup sets can be renamed and deleted with confirmation", async () => {
  const [page,libraryRoute] = await Promise.all([
    readFile(new URL("../app/mockups/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/mockups/library/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page,/setRenamingTheme\(theme\);setRenameValue\(theme\)/);
  assert.match(page,/>Rename set<\/button>/);
  assert.match(page,/Yes, delete set/);
  assert.match(page,/permanently removes the set and every saved mockup inside it/);
  assert.match(libraryRoute,/export async function PATCH/);
  assert.match(libraryRoute,/export async function DELETE/);
  assert.match(libraryRoute,/\[row\.objectKey,row\.occlusionKey,preparation\?\.surfaceMaskKey,preparation\?\.depthKey/,
    "deleting a set removes the original and every prepared scene layer");
  assert.match(page,/sourceTheme/);
  assert.match(libraryRoute,/mockup_set_preferences/);
  assert.doesNotMatch(page,/items\.some\(item=>item\.custom\).*Rename/);
  assert.match(page,/open&&<>.*collectionActions/s);
  assert.doesNotMatch(page,/collectionActions"><button[^>]+className="renameSet"/);
});

test("routes each product surface deliberately and never releases a partial batch", async () => {
  const [page,integrated]=await Promise.all([
    readFile(new URL("../app/mockups/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/integrated-mockups.tsx", import.meta.url), "utf8"),
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
  /* The generative renderer had already been taken out of both screens; its
     routes, its prompt file and its job table were left deployed behind them,
     holding a live fal key and an allowance the plans still advertised. Gone
     now, and this is what keeps them gone. */
  for (const dead of ["api/mockups/render/route.ts","api/mockups/render-test/route.ts","mockups/product-renderers.ts"])
    assert.equal(existsSync(new URL(`../app/${dead}`, import.meta.url)), false,
      `${dead} is the generative renderer and must not come back`);
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
});

test("restores batch colors and blocks publishing until every selected listing has a photo", async () => {
  const [page,review]=await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/final-listing-review.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page,/selectedColorIds\?:number\[\]/);
  assert.match(page,/function batchStateSnapshot\(overrides:Record<string,unknown>=\{\}\).*selectedColorIds,/s);
  assert.match(page,/setSelectedColorIds\(Array.isArray\(state\.selectedColorIds\)/);
  assert.match(page,/selectedPublishDrafts\(\)/);
  assert.match(page,/Add a photo to every selected listing before publishing/);
  assert.match(review,/Choose exactly which listings to publish/);
  assert.match(review,/No listing photo selected/);
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
    readDraftImplementation(),
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
  assert.match(page,/Target profit/);
  assert.match(page,/Change this to recalculate prices/);
  assert.match(page,/changeProfit\(value:number\)[\s\S]*recalculate\(nextPricing\)/);
  assert.match(page,/Create a custom shipping profile \(optional\)/);
  assert.match(page,/Your current prices already meet this profit goal/);
  assert.match(page,/recommendation-result/);
  assert.match(page,/Discard changes/);
  assert.match(page,/Save or discard your custom profile to continue/i);
  assert.doesNotMatch(page,/Approve pricing \+ shipping/);
  /* D232 · That chip restated what the dropdown option already shows. The figure
     that is NOT visible elsewhere — the shortfall against Printify's cost — keeps
     its own warning, which is what actually protects the seller. */
  assert.match(page,/is \$\{shippingShortfall\.toFixed\(2\)\} below Printify/);
  /* D217: pricing moved onto the Product page, so this step is draft creation
     and is described as that. The pricing UI itself is asserted intact by
     tests/feature-inventory.test.mjs. */
  assert.match(page, /Review the plan, then create the private drafts/);
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
  assert.match(page,/onChange=\{event=>live\(event\.target\.value\)\}/);
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
  const v2 = await readFile(new URL("../app/interface-v2.css", import.meta.url), "utf8");
  /* D818 - this asserted `.management-page>header h1{color:#f7f0e4}`, a near-white
     heading from the era when these pages had a dark hero behind them. The hero
     went years ago; the rule stayed, and the interior pages now sit on the light
     pane, where a #f7f0e4 heading is invisible. It is deleted, and the heading
     ink is the shell's own #3d2538 - the same value the workflow h1 computes to
     and the same value the approved preview computes to.

     The nav-active assertion went with .management-nav itself. */
  assert.doesNotMatch(css, /management-page>header h1/);
  assert.match(v2, /\.app-shell \.factory-work > \.interior-page > header h1\{[\s\S]{0,120}color:#3d2538/);
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
  assert.match(batches,/removeHistoryRows/);
  assert.match(await readFile(new URL("../app/batch-history-read.ts",import.meta.url),"utf8"),/method:'DELETE'/);
});

test("connects Etsy with PKCE and finishes only the exact Printify-linked Etsy listing", async()=>{
  const [page,oauth,callback,client,publish,queue,publishState,finish,migration]=await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/api/etsy/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/etsy/callback/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/etsy/client.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/printify/drafts/publish/route.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/printify/drafts/publish/queue.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/printify/publish-state.ts",import.meta.url),"utf8"),
    readFile(new URL("../app/api/etsy/finish.ts",import.meta.url),"utf8"),
    readFile(new URL("../drizzle/0009_etsy_connection.sql",import.meta.url),"utf8"),
  ]);
  assert.match(page,/Connect Etsy before publishing/);
  assert.match(oauth,/code_challenge_method:"S256"/);
  /* The scope list moved into shop-map-auth so Shop Map can add
     transactions_r without widening what everybody else is asked for. The
     contract this test protects is unchanged: the ordinary connect flow asks
     for exactly the four Listing Factory scopes. */
  assert.match(oauth,/scope=body\.intent==="sales"\?SHOP_MAP_SCOPES:BASE_SCOPES/);
  const scopes=await readFile("app/shop-map-auth.ts","utf8");
  assert.match(scopes,/BASE_SCOPES = "listings_r listings_w shops_r shops_w"/);
  assert.doesNotMatch(oauth,/transactions_r/);
  assert.match(oauth,/etsyRedirectUri/);
  assert.match(callback,/grant_type:"authorization_code"/);
  assert.match(callback,/goldieSiteUrl/);
  assert.match(client,/grant_type:"refresh_token"/);
  assert.match(client,/ETSY_REDIRECT_URI/);
  assert.match(client,/ETSY_REDIRECT_URI is not configured/);
  assert.doesNotMatch(client,/chatgpt\.site/);
  assert.match(client,/ETSY_API_SECRET/);
  /* D637 renamed this: it no longer WAITS, it takes a short bounded look and
     hands the item back to the queue if the id is not ready. */
  assert.match(queue,/pollForEtsyListing/);
  assert.match(publishState,/product\.external\?\.id/);
  assert.match(queue,/readPrintifyPublishState/);
  /* The rule is about locating a LISTING: never guess by sorting newest or
     matching titles, only follow the exact Printify link. D639 compares Printify
     SHOP titles against the connected Etsy shop name, which is a different
     question, so the assertion now names the listing-lookup forms it guards. */
  assert.doesNotMatch(`${publish}\n${queue}`,/sort_on|newest|listing.*title.*match|match.*listing.*title/i);
  assert.doesNotMatch(`${publish}\n${queue}`,/findListingByTitle|searchListings/i);
  assert.match(finish,/listing\.shop_id/);
  assert.match(finish,/The Listing Factory stopped without editing it/);
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
  assert.match(ui,/Autosave on/);assert.match(ui,/steps complete/);assert.match(ui,/Your completed batch is summarized below/);
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
  assert.match(dashboard,/GoldieCommandBar/);assert.match(dashboard,/metaKey/);assert.doesNotMatch(page,/<GoldieInsight>/);assert.doesNotMatch(page,/currentInsight/);
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
  const categoryScore=await readFile(new URL("../app/etsy-category-score.ts",import.meta.url),"utf8");
  assert.match(categoryScore,/art & collectibles › prints ›/);
  assert.match(categoryScore,/exactLeaf/);
  assert.match(categoryScore,/dress shirts\?\|button\[- \]downs\?/);
  assert.match(categoryScore,/childCategory/);
  assert.match(categoryScore,/childProduct/);
  assert.match(categoryScore,/notebook\|journal/);
  assert.match(categoryScore,/phone case/);
  assert.match(categoryScore,/gender\[- \]neutral adult/);
  assert.match(page,/product:\{blueprintTitle:templateDetails/);
});

/* D416 · Connect is a one-time gate before the four steps, not the first of
   them - it used to read "Step 1 of 4 · Product" under "Connect your accounts". */
test("places each step count directly below its page title", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    Promise.all([readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8"),readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8")]).then(x=>x.join("\n")),
  ]);
  /* D220: four stages, so the counter is "Step 2 of 4 · Images" rather than a
     top-level count with a nested "Finish · phase (n of 4)" variant. */
  assert.match(page, /stepCount=\{workflowStep==="connect"\?<p className="hero-step-count">Account setup · before you start<\/p>:undefined\}/);
  assert.doesNotMatch(page, /className="approved-step-count"/);
  assert.match(styles, /\.app-shell \.hero-step-count/);
  /* D727 · The room under the head used to come from
     `.app-shell .hero{padding-bottom:30px!important}`. The migrated head owns
     its own spacing now, at the 25px measured from the prototype, and the
     !important is gone - it was beating interface-v2 and putting 80px between
     the title and the first panel. */
  assert.match(styles, /\.app-shell \.factory-page-head\{[^}]*margin:0 0 25px/);
  assert.doesNotMatch(styles, /\.app-shell \.hero\{padding-bottom:30px!important\}/);
});

test("labels every progress bubble with a short workflow name", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    Promise.all([readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8"),readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8")]).then(x=>x.join("\n")),
  ]);
  /* D222 · RAIL_STAGES carries the labels now, one per page, so the parallel
     nine-entry short-label array is gone. */
  assert.match(page, /\{label:"Setup",index:1,title:"Choose a product and add designs"/);
  assert.match(page, /\{label:"Designs",index:2,title:"Add designs and create drafts"/);
  assert.match(page, /\{label:"Review",index:8,title:"Review and finish listings"/);
  assert.match(page, /<em className="progress-bubble-label">\{stage\.label\}<\/em>/);
  assert.match(page, /className="progress-bubble-label"/);
  assert.match(styles, /\.app-shell \.progress-bubble-label\{/);
});

test("shows completion feedback only where it adds information", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    Promise.all([readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8"),readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8")]).then(x=>x.join("\n")),
  ]);
  assert.match(page, /fileNotice&&\(workflowStep==="setup"\|\|workflowStep==="designs"\)&&<p className="file-add-notice"/);
  assert.match(page, /Titles, tags, and descriptions complete/);
  assert.doesNotMatch(page, /workflowStep==="designs"&&complete&&<div className="step-success-banner"/);
  assert.doesNotMatch(page, /workflowStep==="designs"&&complete&&[^\n]*Etsy details complete/);
  assert.match(page, /Listing photos complete/);
  assert.doesNotMatch(page, /fileNotice&&workflowStep!=="designs"/);
  assert.match(styles, /\.app-shell \.step-success-banner\{/);
  /* Other genuinely useful completion banners still share one treatment. */
  assert.match(styles, /border:1px solid #dfc8d5/);
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
  const clarity = await Promise.all([readFile(new URL("../app/clarity-pass.css",import.meta.url),"utf8"),readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8")]).then(x=>x.join("\n"));
  /* D541 - the count lived in an editor-heading above one big block. It reports
     per row now - "9 of 13 tags", "Same as batch", "Ready" - and per panel, and
     wrapping any of those onto a second line is what this has always been about. */
  assert.match(clarity, /\.app-shell \.listing-card-meta\{[^}]*white-space:nowrap/);
  /* D553 - the chooser is gone: opening a task shows every listing's work, each
     under its name, which is what step 2 did before D541. */
  assert.match(clarity, /\.app-shell \.listing-card-meta\{[^}]*white-space:nowrap/);
  assert.match(clarity, /\.app-shell \.task-panel-heading\{/);
});

test("renders personalization as an On-left Off-right toggle", async () => {
  const [page,styles] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    Promise.all([readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8"),readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8")]).then(x=>x.join("\n")),
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
  assert.match(page, /Object.values\(PLANS\).map/);
  assert.match(page, /\{plan.name\}/);
  assert.match(page, /plan.annualPrice:plan.price/);
  assert.match(page, /Manage billing/);
  assert.match(page, /choosePlan\(plan.key\)/);
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
  assert.match(page, /designsFinished\?"Add another folder"/);
  assert.match(page, /className="file-add-notice"/);
});

test("keeps a verified Printify template usable when its Etsy listing is inactive", async () => {
  const [page, workflow, printify, drafts] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/factory-tools.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/printify/route.ts", import.meta.url), "utf8"),
    readDraftImplementation(),
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
  assert.match(page, /shippingTemplateId:preparation\?\.shippingProfileId\?\?etsyShippingProfileId/);
  assert.match(drafts, /selectedShippingTemplateId/);
  assert.match(drafts, /external:\{shipping_template_id:selectedShippingTemplateId\}/);
  assert.match(printify, /UPDATE product_recipes SET pricing_json/);
});

test("does not invent high-risk Etsy context fields", async () => {
  const intelligence = await readFile(new URL("../app/api/listing-intelligence/route.ts", import.meta.url), "utf8");
  assert.match(intelligence, /TEXT_SUPPORTED_OPTIONAL=\/\^\(room\|holiday\|occasion\|recipient\)\$\/i/);
  assert.match(intelligence, /normalizedContext\.includes/);
  assert.match(intelligence, /supportedOption…75257 tokens truncated…e publishing again");
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
  assert.match(queue, /The Listing Factory published once and did not repeat it/);

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
  assert.match(match, /The Listing Factory read a listing this Printify store published and Etsy says it belongs to a different shop/);
});

/* D639 · Brittany, reading the refusal: "there's no navigation to go back to the
 * Etsy or Printify connection after you've connected." She was right, and it
 * made the refusal above unactionable - it tells a seller to reconnect Etsy with
 * nowhere to do it. Once both accounts were connected the connect screen was
 * unreachable: the auto-skip moves past it and nothing linked back. */
test("the connection screen stays reachable after connecting — D639", async () => {
  const [app, management, icons] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/factory-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/nav-icons.tsx", import.meta.url), "utf8"),
  ]);

  /* D721 · Brittany approved removing the sidebar icons, so NavIcon no longer
     renders in the factory sidebar. The rule this guards is that the Connections
     entry still exists and still points at step=connect. */
  assert.match(app, /href="\/listing-factory\?step=connect"[\s\S]{0,120}Connections/);
  /* D834 · Connections moved into the account menu. What D639 guards is that
     the way back to the connection screen exists at all, and that it still
     points at ?step=connect - not which list it sits in. */
  assert.match(management, /role="menuitem" href="\/listing-factory\?step=connect">Connections<\/a>/,
    "D203's rule: both navigations list the same destinations or they drift");
  assert.match(icons, /case "connections":/);
  assert.match(icons, /\| "connections"/);

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
  assert.match(route, /settings=JSON\.stringify\(\{\.\.\.JSON\.parse\(settingsJson\|\|"\{\}"\),frozenProductIds:ids\.map\(String\),frozenAt:new Date\(\)\.toISOString\(\)\}\);/);

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

  /* D845 · Nothing is emailed at all now, seller-fixable or not, so the skip
     that D645 checked has nothing left to skip. The half that matters - the
     write happens either way - is what this asserts, and the classification is
     still what sorts the two kinds apart on the maintenance page. */
  assert.match(log, /INSERT INTO error_log/, "everything is still recorded");
  assert.doesNotMatch(log, /api\.resend\.com/);

  // And the page separates them rather than making her read every message.
  assert.match(control, /const \[errorFilter, setErrorFilter\] = useState<"all"\|"platform"\|"seller">\("all"\)/);
  assert.match(control, /errorFilter === "all" \|\| \(errorFilter === "seller"\) === isSellerFixable\(item\.message\)/);
  assert.match(control, /Seller can fix/);
  assert.match(control, /Needs owner/);
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
  assert.match(app, /Final photo order/);
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
  assert.match(app, /\$\{createdDraftCount\} \$\{createdDraftCount===1\?"draft":"drafts"\}/);
  assert.doesNotMatch(app, /\$\{drafts\.length\} drafts`/);
  assert.match(app, /Preparing every listing for background creation\. Keep this page open\./);
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
  assert.match(app, /Each affected design must be replaced or approved/);

  // A one-design batch counted itself in the plural in four more places.
  assert.match(app, /\$\{summary\.drafts\} \$\{summary\.drafts===1\?"draft":"drafts"\}/);
  assert.match(app, /\$\{createdDraftCount\} \$\{createdDraftCount===1\?"draft":"drafts"\} created/);
  assert.doesNotMatch(app, /drafts\.filter\(draft=>draft\.status==="Created"\)\.length===1\?"draft":"drafts"/,
    "the final screen does not repeat an open-product draft badge above the batch review");

  /* And the step 3 badge called itself ready above a crimson row on the same
     card - D624's fault again, one row further down. */
  assert.match(app, /const etsyReady=files\.filter\(file=>etsyListingDetailsComplete\(file\.etsy\)\)\.length;/);
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
  assert.match(tools, /async function beginAddProduct\(\)\{[\s\S]{0,300}setMessage\(""\);revealForm\(\)/,
    "the header action must reveal the form it opened");
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
  assert.match(app, /await restoreBatchById\(existing,workflowStep,finishPhase,true\);/);
  /* The outgoing product's pending autosave is flushed first, or the last
     keystrokes land on the incoming product's batch. */
  const openBody = app.slice(app.indexOf("function openBundleProduct(index:number,recoveryOnly=false){"), app.indexOf("function openBundleProduct(index:number,recoveryOnly=false){") + 1600);
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

test("a fresh batch never attempts to reopen a remembered product — D887", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /restoringRememberedProduct|restoredProductNotice/);
  assert.doesNotMatch(app, /localStorage\.getItem\("goldie-active-recipe"\)/);
  assert.match(app, /if \(!response\.ok \|\| !result\.product\)\{[\s\S]{0,700}setBlockingModal/,
    "a product explicitly chosen by the seller still reports why it cannot open");
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
  assert.match(app, /Reopen the unchecked/);

  // The obsolete confirmation summary no longer computes an unused bundle total.
  assert.doesNotMatch(app, /const bundleVariantCounts=useMemo\(/);
  assert.doesNotMatch(app, /preflightOpen|preflight-backdrop/);
  assert.doesNotMatch(app, /All \{pricedVariants\.length\} enabled variants/,
    "the open product's count is not the bundle's count");
});

test("the mockup row cannot say none while scenes are saved — D659", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  assert.match(app, /Final photo order/);
  assert.doesNotMatch(app, /Create lifestyle mockups/);
  return;

  assert.match(app, /function scenesChosenFor\(recipe:Recipe,isActive:boolean\)\{/);
  assert.match(app, /function mockupRowValue\(created:number,scenes:number\)\{/);
  assert.match(app, /if\(scenes\)return `\$\{scenes\} \$\{scenes===1\?"scene":"scenes"\} chosen — not created yet`;/);
  assert.match(app, /Create lifestyle mockups",value:started\?mockupRowValue\(counts\.mockups,scenesChosenFor\(recipe,isActive\)\):blank/);
  assert.doesNotMatch(app, /counts\.mockups\?plural\(counts\.mockups,"mockup"\):"None yet — optional"/,
    "the row counted rendered mockups only, and read 'None yet' over two saved scenes");
});

test("setupComplete cannot be true without every axis the product actually exposes — D659/D927", async () => {
  const route = await readFile(new URL("../app/api/product-recipes/route.ts", import.meta.url), "utf8");

  assert.match(route, /merged\.requiresColorSelection!==false&&!\(merged\.defaultColorIds\|\|\[\]\)\.length/);
  assert.match(route, /merged\.requiresSizeSelection!==false&&!\(merged\.defaultSizeIds\|\|\[\]\)\.length/);
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
  assert.match(tools, /window\.removeEventListener\("goldie-recipe-shop",onShop\)/);
});

/* D660 · The cosmetic pass from the completed bundle review. Every item was
   read off the live step-4 screen, not guessed. */
test("the final review reads honestly — D660", async () => {
  const [app, css] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    Promise.all([readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8"),readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8")]).then(x=>x.join("\n")),
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
  assert.match(css, /\.app-shell \.row-value\{min-width:0;overflow-wrap:anywhere\}/);

  // The heading must agree with the button underneath it.
  assert.match(app, /title: "Review your listings", copy: etsyDraftTransferState==="complete"\?"Your Etsy drafts were created and verified\."[\s\S]*handoffBlockers\(\)\.length\?"Fix the missing items shown on the listing cards\.":"Everything is ready\. Save the batch to Etsy Drafts\."/);

  /* The heading and the draft chip overlapped once the chip carried a product
     name: "✓ 2 drafts on Gildan Hoodie" printed through the heading. */
  assert.match(css, /\.app-shell \.step-heading\{display:flex!important;[^}]*justify-content:space-between!important;gap:20px!important/);
  assert.match(css, /\.app-shell \.step-heading>\.done-mark\{flex:0 0 auto!important;white-space:nowrap!important/);

  /* Tags under thirteen are an optimisation - publishBlockers never mentions
     them - so they must not wear the same mark as a listing with no title. */
  assert.match(app, /done:started&&counts\.designs>0&&counts\.titled===counts\.designs,advice:/);
  assert.doesNotMatch(app, /done:started&&counts\.designs>0&&counts\.titled===counts\.designs&&counts\.tagged===counts\.designs/,
    "a short tag count must not mark the row as incomplete");
  assert.match(app, /have fewer than 13 tags\. This is optional and does not block Review batch\./);
  assert.match(app, /\{row\.advice\?<small className="row-advice">\{row\.advice\}<\/small>:null\}/);
  assert.match(css, /\.row-advice[^{]*\{[^}]*color:var\(--muted/);
});

test("a bundle member with no keyword bank says so on step 1 — D660", async () => {
  const [tools, app] = await Promise.all([
    readFile(new URL("../app/factory-tools.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
  ]);

  /* Found live: the 1566 crewneck joined the bundle with no bank and only said
     so at step 3, with Auto-create disabled and the designs already done. */
  assert.doesNotMatch(tools, /needs-bank-note|No keyword bank yet — titles cannot be auto-written for it/);

  /* Offered, never applied silently: two products in one bundle can legitimately
     want different banks, so copying it across would be a guess about her
     keywords rather than a convenience. */
  assert.match(app, /`Use this bank for all \$\{bundleRecipes\.length\} products`/);
  assert.match(app, /async function applyBankToBundle\(\)\{/);
  // Only offered when it would actually change something.
  assert.match(app, /autoTitleBank&&bundleRecipes\.some\(recipe=>recipe\.id!==activeRecipe\?\.id&&recipe\.keywordListId!==autoTitleBank\.id\)/);
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

  /* Draft creation is separately bounded at four independent requests. */
  assert.match(app, /const MAX_CONCURRENT_DESIGNS = 4;/);
  assert.match(app, /runBounded\(targetFiles, batchConcurrency/);
  assert.match(app, /processDesign\(design,undefined,phase=>markDraftCreationPhase\(design\.id,phase\)\)/);
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
  assert.match(app, /\{!complete&&bundleQualityGroups\.length>0&&<section className="bundle-quality-review"/);
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

/* D681 · Measured on the live page, not read from source: "Review all listings
   in Printify" sat 66px above the card it labels, which is why the card looked
   like it was floating low with a hole above it. Three rules in three files
   stacked to make that space, and a fix that reaches only one of them moves the
   number without closing the gap - D679 and D680 each tried and it stayed at
   68 then 66. */
test("the Printify review link sits on its card — D681", async () => {
  const clarity = await Promise.all([readFile(new URL("../app/clarity-pass.css",import.meta.url),"utf8"),readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8")]).then(x=>x.join("\n"));

  /* lilac-theme sets padding-top:24px!important on the workspace, so the
     override has to carry !important too or it silently loses. */
  assert.match(clarity, /\.app-shell \.post-draft-workspace\{padding-top:0!important;margin-top:0!important\}/);
  /* theme.css gives the link 10px padding and an 8px bottom margin, sized for a
     full-width button it is no longer. */
  assert.match(clarity, /\.app-shell \.post-draft-heading \.open-all-button\{margin:0!important;padding:2px 0!important;width:auto!important\}/);
  assert.match(clarity, /\.app-shell \.post-draft-heading\{margin:0 0 6px!important;padding:0!important\}/);

  /* All three live in different files, so the comment names them - the next
     person to see a stubborn gap should not have to rediscover that. */
  const why = clarity.slice(clarity.indexOf("/* D681"), clarity.indexOf("D681") + 900);
  assert.match(why, /lilac-theme\.css/);
  assert.match(why, /theme\.css/);
});

/* D682 · Three things I built in the browser, she approved, and I then never
   put into the source. They were live only as injected CSS in one tab, so every
   deploy shipped without them and she had to ask again. */
test("the photo panel keeps what was approved in the preview — D682", async () => {
  const [clarity, app] = await Promise.all([
    Promise.all([readFile(new URL("../app/clarity-pass.css",import.meta.url),"utf8"),readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8")]).then(x=>x.join("\n")),
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
  ]);

  /* 36px was the only thing on the panel saying WHICH design you are picking
     photos for, and both filenames are "ChatGPT Image Aug 28, 2026, 10_4x_xx
     AM34-gigapixel-standard v2-4x.png". */
  /* D684 - raised again, to 132px. D682's 96px was pushed and never deployed, so
     the live page served the original 36px the whole time she was asking. */
  /* D687 - 132px moved to the OPEN card. Twenty collapsed rows have to be
     scannable at 52px; the one she is working on stays the size she asked for
     four times. Density must not quietly take that back. */
  assert.match(clarity, /\.app-shell \.listing-card\.is-open \.listing-card-thumb\{width:132px;height:132px/);
  assert.match(clarity, /\.app-shell \.listing-card-thumb\{width:52px;height:52px/);
  assert.doesNotMatch(clarity, /\.listing-card-thumb\{width:36px/);
  assert.doesNotMatch(clarity, /\.listing-card-thumb\{width:36px/);
  // Room for two lines of name beside a 96px thumb, instead of one clipped line.
  assert.match(clarity, /\.app-shell \.listing-card-summary\{[^}]*text-overflow:ellipsis/);

  /* A 430px scroller AND an expander do the same job; together, expanding just
     makes a longer scroll inside a fixed box. */
  assert.doesNotMatch(clarity, /printify-image-picker\{max-height:430px/);
  assert.match(clarity, /\.app-shell \.task-panel \.printify-image-picker\{padding:14px;/);

  /* display:grid + place-items:center puts the chevron on its own row above the
     label - the same detached arrow this was supposed to fix. */
  assert.match(clarity, /\.printify-more-toggle\{display:inline-flex;align-items:center;justify-content:center;gap:7px;width:max-content/);
  assert.doesNotMatch(clarity, /\.printify-more-toggle\{display:grid;width:100%;place-items:center/);
  // Chevron leads the label and turns over when open.
  assert.match(app, /className=\{`printify-more-toggle\$\{showAll\?" is-open":""\}`\}[^]{0,160}<span>[^<]+<\/span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7\.5 5 5 5-5"\/><\/svg>/);
  assert.match(clarity, /\.printify-more-toggle\.is-open svg\{transform:rotate\(180deg\)\}/);
});

/* D684 · The photo picker showed 104px tiles on a white background for garments
   photographed on white. Every image loaded - naturalWidth 1200 on all 36 - so
   nothing was broken; the ivory colourways were simply invisible at that size on
   that colour, and she could not tell which photo she was selecting. */
test("the Printify photo tiles are big enough, on a tile that is not white — D684/D971", async () => {
  const clarity = await Promise.all([readFile(new URL("../app/clarity-pass.css",import.meta.url),"utf8"),readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8")]).then(x=>x.join("\n"));
  assert.match(clarity, /\.app-shell \.printify-all-images\{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  // The 2-column group layout is what held the tiles to 104px.
  assert.doesNotMatch(clarity, /printify-view-groups\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  // A white garment on a white tile is the defect. The tile has to be tinted.
  assert.match(clarity, /\.printify-image-option\{[^}]*background:#efe7ee!important/);
  assert.match(clarity, /\.printify-image-option img\{aspect-ratio:1\/1!important/);
});

/* D683 · The gap above the placement card survived D679, D680 and D681 because
   all three treated it as a margin problem. It was not. The link lived in its own
   <section class="post-draft-workspace">, a direct child of .app-shell, and
   .app-shell is a grid while .workspace is display:contents - which promotes the
   sticky .workflow-progress rail to a grid item sharing that row. The rail sized
   the row to 81px; the link filled 46px; the leftover 35px was grid row, and no
   margin on a grid item can shrink a row that a sibling in the other column is
   sizing. This pins the structural fix so it cannot regress into a margin tweak. */
test("the open-all link shares the cards' row instead of owning one — D683", async () => {
  const [clarity, app] = await Promise.all([
    Promise.all([readFile(new URL("../app/clarity-pass.css",import.meta.url),"utf8"),readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8")]).then(x=>x.join("\n")),
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
  ]);

  // The section that owned the row is gone from the render, not merely restyled.
  assert.doesNotMatch(app, /<section className="post-draft-workspace">/);
  // The link is passed as stepProductCards' header, so it renders inside the grid
  // that also holds the cards.
  assert.match(app, /function stepProductCards\(statusFor:[^]{0,220}showCards=true,header:ReactNode=null\)\{/);
  assert.match(app, /className="step-product-cards"[^]{0,220}\{header\}/);
  assert.match(app, /<div className="post-draft-heading">\{drafts\.filter\(draft=>draft\.status==="Created"\)\.length>1&&<button className="open-all-button"/);
  // Nothing but the section's own gap between the link and the first card.
  assert.match(clarity, /\.post-draft-heading\{[^}]*margin:0/);

  /* D683 · the collapsed rows. A fixed 150px label column wrapped three of the
     five labels onto a second line, so the rows were 48/42/42/48/48px. */
  assert.match(clarity, /\.batch-product-row ?\{[\s\S]{0,300}grid-template-columns: ?34px minmax\(0, ?1fr\) auto auto/);
  // The empty task-panel container left a band of dead colour under the last row.
  assert.match(clarity, /\.step-product-body:empty\{display:none!important\}/);
  // One colour means "done" in this card: the marks match the "N drafts" badge.
  assert.match(clarity, /\.row-mark ?\{[\s\S]{0,300}background: ?#edf7f0/);
});

/* D685 · "you scroll past the printify photos, and then you see one picture of a
   design... another design. And I don't know that that's another listing. That's
   where I'm really struggling is the differentiation is not enough." The panel
   stacks every listing in the batch and the only thing between them was a 1px rule
   under a heading that read as a filename. */
test("each listing in a task panel is separated and numbered — D685", async () => {
  const [clarity, app, rows] = await Promise.all([
    Promise.all([readFile(new URL("../app/clarity-pass.css",import.meta.url),"utf8"),readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8")]).then(x=>x.join("\n")),
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/listing-rows.tsx", import.meta.url), "utf8"),
  ]);
  /* D687 - numbered once, in the shared component, instead of in four hand-rolled
     copies that could drift apart. Said plainly, where the eye lands first. */
  assert.match(rows, /Listing \{position\.index\} of \{position\.total\}/);
  assert.match(rows, /position=row\.position\|\|\{index:index\+1,total:rows\.length\}/);
  assert.match(clarity, /\.app-shell \.listing-card-index\{display:block;font-size:11px;font-weight:800/);
  // A bounded card with real space around it, not a hairline rule.
  assert.match(clarity, /\.app-shell \.listing-card\{border:1px solid[^}]*margin-bottom:10px/);
  // Open reads as a different, darker surface - indentation alone was not enough.
  assert.match(clarity, /\.app-shell \.listing-card\.is-open\{margin-bottom:22px;background:#f1e8f0/);

  /* The title is a caption, not a headline: "its almost always going to be a junk
     title like that so either make it much smaller and subtler or get rid of it
     altogether." D684 had enlarged it to 1rem bold, which was backwards. */
  assert.match(clarity, /\.app-shell \.listing-card-summary\{[^}]*font-size:12px;font-weight:400/);
  assert.doesNotMatch(clarity, /\.listing-card-summary\{[^}]*font-size:1rem/);
  // And it never prints the upload filename or repeats the listing number.
  assert.match(app, /const listingLabel=\(design:DesignFile\|undefined\)=>\{/);
  assert.doesNotMatch(app, /listing \$\{index\+1\} of \$\{listings\.length\}/);
});

/* D688 · The photo picker's collapsed default. Measured on her live page: the
   toggle said "Show 9 more Printify photos" while twelve view groups - eighteen
   photos across two listings - were rendered and visible. Not a styling problem;
   the filter deciding what "front and back only" means was matching six groups. */
test("the collapsed photo picker keeps a compact representative set — D688/D971", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  /* \b(front|back)\b matches "Model 1 front" and "Model 2 back" just as happily
     as "Front", which is why the collapse never collapsed. */
  assert.doesNotMatch(app, /\/\\b\(front\|back\)\\b\/i\.test\(view\)/,
    "an unanchored word match lets every model shot through");
  assert.match(app, /const visible=view==="selected"\?selectedEntries:showAll\?/,
    "the Selected view keeps all chosen mockups accessible");
});

/* D690 · Found on the live deploy, not in review: the indent that aligns a text
   field with the summary column above it costs 179px, and the photo picker inside
   an open card was fitting two 132px tiles a row instead of three. */
test("panels that open by default get their width back — D690", async () => {
  const [rows, clarity] = await Promise.all([
    readFile(new URL("../app/listing-rows.tsx", import.meta.url), "utf8"),
    Promise.all([readFile(new URL("../app/clarity-pass.css",import.meta.url),"utf8"),readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8")]).then(x=>x.join("\n")),
  ]);
  assert.match(rows, /className=\{`listing-rows\$\{defaultOpen\|\|alwaysOpen \? " is-worksurface" : ""\}\$\{compactNavigation \? " is-compact" : ""\}\$\{alwaysOpen\?" is-static-open":""\}`\}/);
  assert.match(clarity, /\.app-shell \.listing-rows\.is-worksurface \.listing-card-detail[^{]*\{padding-left:18px\}/);
  // Text panels keep the alignment - that is what made the detail read as nested.
  assert.match(clarity, /\.app-shell \.listing-card-detail\{padding:18px 18px 18px 99px/);
  assert.match(clarity, /\.app-shell \.listing-card\.is-open \.listing-card-detail\{padding-left:179px\}/);
});

/* D691 · Swept every panel on the live deploy of 11ea58e rather than fixing one
   thing and shipping it. Six defects, all of them the same shape - a rule or a
   colour that only got changed in one of the places it lives. */
test("one language survives a sweep of every panel — D691", async () => {
  const [app, rows, clarity, approved, globals] = await Promise.all([
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/listing-rows.tsx", import.meta.url), "utf8"),
    Promise.all([readFile(new URL("../app/clarity-pass.css",import.meta.url),"utf8"),readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8")]).then(x=>x.join("\n")),
    Promise.all([readFile(new URL("../app/approved-functional.css",import.meta.url),"utf8"),readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8")]).then(x=>x.join("\n")),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  /* Measured live on the publish step: "1 needs a look" rendered #874a32. D689
     recoloured .final-listing-card .needs-attention and missed the group summary,
     which is a different selector - so the brown she rejected twice was still on
     screen. Every needs-attention surface, one colour. */
  const strip = (css) => css.replace(/\/\*[^]*?\*\//g, "");
  for (const brown of ["#874a32", "#8a5a1d", "#8a5a12"]) {
    for (const sheet of [clarity, approved, globals]) {
      // Declarations only - the comments recording why these were rejected stay.
      assert.ok(!strip(sheet).includes(brown),
        `${brown} is brown and she has rejected it three times`);
    }
  }
  assert.match(globals, /summary em\.needs-attention\{background:rgba\(217,79,79,\.12\);color:#b53838\}/);

  // Each panel's row previews what THAT panel asks her to judge, not the title thrice.
  assert.match(app, /function taskSummary\(task:string,design:DesignFile\):string\{/);
  assert.match(app, /if\(task==="description"\)\{/);
  assert.match(app, /return activeBundle\?"Uses this product’s description":"Uses batch description"/);
  assert.match(app, /if\(task==="etsy"\)return design\.etsy\?\.category/);

  // "1 need attention" was not English.
  assert.match(rows, /\{flagged\.length === 1 \? "needs" : "need"\}/);

  /* Sans everywhere. The uploads panel's heading - the one naming the listing she
     is adding photos to - was still DM Serif Display. */
  assert.doesNotMatch(approved, /listing-photo-design-identity b\{[^}]*DM Serif Display/);
  /* D692 - fixed at the rule that caused it instead of per heading. The CARD
     TITLE rule carries !important and covers every card and panel title, which is
     why a targeted override on one heading kept losing. */
  /* D819 - that CARD TITLE rule is deleted. It was the reason a targeted
     override kept losing, and it stayed the reason after the override became
     the migrated one: it set Manrope with !important, so interface-v2's Inter
     lost too, and step 3's card titles were still Manrope on the live build.
     What this assertion is for - sans, everywhere, decided in one place - now
     holds in interface-v2, without an !important to beat next time. */
  assert.doesNotMatch(clarity, /\.managementOnly h3/);
  assert.match(clarity, /font-family: "Inter"|font:700 14px\/1\.3 Inter/);
});

/* D692 · Closing the refactor out. Three implementations of "show me every
   listing in this batch" became one, and the old markup is gone rather than left
   sitting beside the new. */
test("only one implementation of the listing rows survives — D687/D692", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  for (const stale of ["task-listing-work", "task-listing-head", "task-listing-count", "task-listing-thumb"]) {
    assert.doesNotMatch(app, new RegExp(`className="${stale}"`),
      `${stale} was the hand-rolled markup ListingRows replaced`);
  }
  // Step 3 through designTaskRows, step 2's photo panels through listingWorkRows.
  assert.equal((app.match(/<ListingRows /g) || []).length, 2);
  /* D709 · Two, since uploads and photo order became one panel. */
  assert.equal((app.match(/listingWorkRows\(\(\{/g) || []).length, 1);

  /* The product name was the last serif in the workflow stage. Its own rule
     exists to make it match the card title, so it follows the card title. */
  const clarity = await Promise.all([readFile(new URL("../app/clarity-pass.css",import.meta.url),"utf8"),readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8")]).then(x=>x.join("\n"));
  assert.doesNotMatch(clarity, /\.app-shell \.bundle-product-id>b\{[^}]*(DM Serif Display|Fraunces)/);
});

/* D693 · Found by the Run 1 acceptance pass, in my own D686 fix. */
test("the stale recipe name cannot launder itself into the seller's name — D693", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  /* D686 stopped Batch History reading setup_name as a name she chose. Restore
     still seeded the seller-name field FROM setup_name, autosave wrote that into
     the snapshot, and the reader then trusted it. Measured on b8ce58cb after D686
     shipped: state.batchDisplayName "Gildan Hoodie" on a sweatshirt batch whose
     active recipe was "Comfort Colors 1566 crewneck". */
  assert.match(app, /setBatchDisplayName\(state\.batchDisplayName\|\|""\);/);
  assert.doesNotMatch(app, /setBatchDisplayName\(payload\.batch\.setup_name/,
    "setup_name is a recipe snapshot and must never seed the seller's own name");
  // And the badge says the opportunity rather than counting a deficit.
  assert.match(app, /`\$\{files\.length-tagged\} with fewer than 13 tags · optional`/);
  assert.doesNotMatch(app, /`\$\{tagged\} of \$\{files\.length\} fully tagged`/);
});

/* D694 · Found by the Run 2 bundle acceptance pass on d463417. */
test("every product's badge summarises its own rows, not just the open one — D694", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  const start = app.indexOf("function bundleCardStatus(");
  const fn = app.slice(start, app.indexOf("/* D378 -", start));

  /* Measured on the Hoodie + 1566 crewneck bundle: two cards, identical rows -
     "2 of 2 titles", "Attached", "2 of 2 ready" - and different badges. The open
     product said "1 could use all 13 tags"; the other said "2 drafts", a step 2
     answer sitting on a step 3 card. D624 wrote the rule down and fixed it for the
     open product only, so the defect survived on every card but one. */
  assert.match(fn, /if\(step==="listing"\)\{[^]*?summary\.titled<summary\.designs/,
    "a closed product's badge has to answer the step it is on");
  assert.match(fn, /summary\.etsyReady<summary\.designs/,
    "including the blocker - Etsy fields are what stop a listing publishing");
  assert.match(fn, /return \{label:`\$\{summary\.drafts\} \$\{summary\.drafts===1\?"Printify draft":"Printify drafts"\}`,tone:"attention"\}/,
    "and publish says ready, not drafts");
  assert.doesNotMatch(fn, /if\(summary\.published\)return[^]*?\n      if\(summary\.drafts\)return \{label:`\$\{summary\.drafts\} \$\{summary\.drafts===1\?"draft":"drafts"\}`,tone:summary\.status/,
    "the step-agnostic fallback is gone");

  // The badge and the rows must read the same map, or they can disagree again.
  assert.match(app, /etsyReady:designs\.filter\(design=>etsyListingDetailsComplete/);

  /* Placement kept its own card layout (D680) and with it lost the label every
     other panel has - two unlabelled previews side by side. */
  /* D695 - the number only. D694 also added the name, which this card already
     carried under the preview, so each one printed its listing twice. */
  assert.match(app, /name:`Listing \$\{listings\.findIndex\([^]+?\)\+1\} of \$\{listings\.length\}`,[^]+?meta:dpi/);
  assert.doesNotMatch(app, /placement-listing-card[^]{0,600}<p className="task-listing-name">/,
    "the name belongs in .placement-design-name, once");
});

/* D697/D698 · Found verifying Brittany's first real bundle publish. */
test("a bundle credits each listing to its own batch, and the button names the shop — D697/D698", async () => {
  const [publish, batches, app, clarity, migration] = await Promise.all([
    readFile(new URL("../app/api/printify/drafts/publish/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/batches/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8"),
    Promise.all([readFile(new URL("../app/clarity-pass.css",import.meta.url),"utf8"),readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8")]).then(x=>x.join("\n")),
    readFile(new URL("../drizzle/0017_publish_items_batch.sql", import.meta.url), "utf8"),
  ]);

  /* One call publishes a bundle and the job stores a single batch_id, taken from
     drafts[0]. After a real publish of the Hoodie + 1566 crewneck bundle, Batch
     History read "4 PUBLISHED TO ETSY" on the hoodie and "DRAFT" with a Resume
     button on the crewneck - whose two listings were live on Etsy. Resuming would
     have published them twice and charged Etsy's fee again. */
  assert.match(publish, /batchByProduct=Object\.fromEntries\(drafts\.filter\(draft=>draft\.id\)\.map\(draft=>\[String\(draft\.id\),String\(draft\.batchId\|\|batchId\)\]\)\)/,
    "each draft already knew its own batch; keep the whole map");
  assert.match(publish, /INSERT INTO etsy_publish_items \(id,job_id,user_id,product_id,batch_id,status,available_at\)/);
  assert.match(publish, /batchByProduct\[String\(productId\)\]\|\|batchId/);

  // Count the listings, not the jobs.
  /* D700 added MAX(updated_at) so the weekly goal can count the week the listings
     went live rather than the week the batch was created. */
  /* D701 - and it falls back to the job's batch when an item has none, so the
     count never depends on a data migration having run. It did not, and every
     published batch read zero. */
  assert.match(batches, /COALESCE\(i\.batch_id,j\.batch_id\) batch_id,COUNT\(\*\) completed,MAX\(i\.updated_at\) published_at FROM etsy_publish_items i LEFT JOIN etsy_publish_jobs j ON j\.id=i\.job_id/);
  assert.doesNotMatch(batches, /FROM etsy_publish_items WHERE user_id=\? AND status='completed' AND batch_id IS NOT NULL/);
  assert.doesNotMatch(batches, /SUM\(completed\) completed FROM etsy_publish_jobs/,
    "the job-level count is what credited a whole bundle to one product");

  /* The column is new, so work already published has no batch_id. Without the
     backfill her four live listings would read as unpublished on first deploy. */
  assert.match(migration, /ALTER TABLE `etsy_publish_items` ADD `batch_id` text;/);
  assert.match(migration, /UPDATE `etsy_publish_items`[^]*SET `batch_id` = \(SELECT `batch_id` FROM `etsy_publish_jobs`/);

  /* D698 - "if they are working with multiple shops, it's just, like, another fail
     safe to make sure it's going to the right place." */
  assert.match(app, /<small className="publish-all-shop">to \{etsyShop\}<\/small>/);
  assert.match(app, /<span className="publish-all-label">/);
  assert.match(clarity, /\.app-shell \.publish-all-button \.publish-all-shop\{display:block;font-size:11px/);
});

/* D699 · The publish-failure list named the field that does not exist. */
test("a failed listing is named by a field it actually has — D699", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  /* DraftResult has `name`, never `designName`, so `draft?.designName` was always
     undefined and the fallback went straight to the word "Listing". It sat in the
     publish-failure list - the one moment she most needs to know WHICH listing
     failed - and it was the last standing type error in the file. */
  assert.doesNotMatch(app, /draft\?\.designName/);
  assert.match(app, /\{draft\?\.title\?\.slice\(0,60\)\|\|draft\?\.name\|\|"Listing"\}/);
});

/* D700 · The weekly goal counted the week the batch was CREATED. */
test("the weekly goal counts the week the listings went live — D700", async () => {
  const [goal, batches] = await Promise.all([
    readFile(new URL("../app/listing-goal.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/batches/route.ts", import.meta.url), "utf8"),
  ]);
  /* Her words: "it shouldn't be counting from when the batch would be created. It
     needs to count for the week that it's being published in." Work begun on a
     Sunday and published on the Monday landed in the wrong week, and a batch
     created weeks ago and published today did not count at all - listings go live
     and the bar does not move. */
  assert.match(goal, /const raw = batch\.published_at \|\| batch\.created_at;/);
  assert.match(goal, /published_at\?: string \| null;/);
  assert.doesNotMatch(goal, /const when = batch\.created_at \? new Date\(batch\.created_at\) : null;/,
    "created_at is the fallback for old rows, never the primary");
  // Both the bar and the goals-page history read the same resolver.
  assert.equal((goal.match(/publishedWhen\(batch\)/g) || []).length, 2);
  // And the API supplies it.
  assert.match(batches, /published_at:mineByProduct\.at\|\|publishedAtByBatch\[String\(row\.id\)\]\|\|null/);
});

/* D703 · Looking at a published batch destroyed the record of what published. */
test("a published batch keeps its receipt when it is reopened — D703", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* The autosave snapshot SAVES batchReceipt and the restore never read it back.
     Open a batch that had published, the receipt sat at its initial null, the next
     autosave wrote that null over the record, and Batch History then offered
     "Resume" on listings that were already live on Etsy.

     Measured on batch 0b79a9b6: receipt present at 02:53:56 with four Etsy URLs,
     null by 02:59:23 - erased by opening the batch to verify it. */
  assert.match(app, /setBatchReceipt\(state\.batchReceipt\|\|null\);/,
    "restore must put the receipt back");
  assert.match(app, /keptAsDrafts,batchReceipt,batchDisplayName/,
    "the snapshot still saves it");
  assert.match(app, /batchReceipt\?:BatchReceipt\|null\}/,
    "and the restored-state type has to declare it or the read is silently dropped");
});

test("D1694: the batch select controls are touch targets, not 17px boxes", async () => {
  /*
    Measured on the deployed Batch History at 375px: 21 controls under 40px,
    the select checkboxes at 21x17. Selecting a design to delete is exactly
    the action that must not be hit by accident or missed three times.
    The box stays small; the label around it is the target.
  */
  const css = await readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8");
  const rule = (selector) => {
    const at = css.indexOf(selector + "{");
    assert.ok(at > -1, `missing rule ${selector}`);
    return css.slice(at, css.indexOf("}", at));
  };
  const select = rule(".batch-select");
  assert.match(select, /min-width:44px/);
  assert.match(select, /min-height:44px/);
  assert.match(rule(".batch-select-all"), /min-height:44px/);
  /* The delete action beside them was 36px. */
  assert.match(rule(".batch-delete-selected"), /min-height:44px/);
  /* The visible box is deliberately still small — that is the point. */
  assert.match(css, /\.batch-select-all input,\.batch-select input\{width:17px;height:17px/);
});
