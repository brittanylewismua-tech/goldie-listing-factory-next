import { test } from "node:test";
import assert from "node:assert/strict";
import { excludedProductNouns, namesExcludedProduct, productFamily } from "../app/product-type-utils.ts";

/* Wrong-garment guard — D74.
 *
 * The original defect: a tee listing got the title "Bachelorette Koozies,
 * Bachelorette Coozies, Bachelorette Sash..." because the keyword bank mixed
 * party goods with apparel and nothing checked the product noun.
 *
 * The first fix matched whole words only, so "koozie" was blocked while
 * "koozies" — the form sellers actually write — passed. These tests pin the
 * plural forms specifically. */

const TEE = "Unisex Heavy Cotton Tee";
const excluded = excludedProductNouns(TEE);

test("the blueprint is recognised as a tee", () => {
  assert.equal(productFamily(TEE), "tee");
});

test("plural product nouns are rejected, not just singular — D74", () => {
  const mustReject = [
    "bachelorette koozie", "bachelorette koozies", "bachelorette coozies",
    "bachelorette sash", "bachelorette party sash",
    "bachelorette sunglasses", "bachelorette tapestry", "bachelorette tattoos",
    "camp bachelorette decor", "camp bachelorette decorations",
    "bride hoodie", "future mrs sweatshirt", "wifey sweatshirt",
  ];
  for (const phrase of mustReject) {
    assert.equal(namesExcludedProduct(phrase, excluded), true,
      `"${phrase}" names a product that is not a tee and must never reach a tee title.`);
  }
});

test("real tee phrases are never rejected", () => {
  const mustKeep = [
    "camp bachelorette shirt", "girls gone mild", "vegas bachelorette",
    "last splash", "she said yes", "fresh off the market",
    "bikinis and martinis", "going to the chapel", "coastal cowgirl bachelorette",
  ];
  for (const phrase of mustKeep) {
    assert.equal(namesExcludedProduct(phrase, excluded), false,
      `"${phrase}" is a valid tee phrase and must not be filtered out.`);
  }
});

test("each product family excludes the others but never itself", () => {
  for (const blueprint of ["Unisex Heavy Cotton Tee", "Unisex Hoodie", "Can Koozie", "Ceramic Mug"]) {
    const family = productFamily(blueprint);
    if (!family) continue;
    const list = excludedProductNouns(blueprint);
    assert.equal(namesExcludedProduct(blueprint, list), false,
      `"${blueprint}" excludes its own product noun — every phrase for it would be rejected.`);
  }
});

test("the keyword bank page and the title generator share one noun list — D90", async () => {
  const { readFile } = await import("node:fs/promises");
  const page = await readFile(new URL("../app/keywords/page.tsx", import.meta.url), "utf8");

  /* There used to be two denylists: a hand-written NON_SHIRT_PRODUCT regex on
   * this page, and PRODUCT_NOUN_GROUPS in product-type-utils. They disagreed —
   * the page blocked "koozies" on save while the generator let it into a title.
   * Two implementations of one rule always drift. */
  assert.doesNotMatch(page, /NON_SHIRT_PRODUCT/,
    "The page has its own product-noun regex again. It must read product-type-utils.");
  assert.match(page, /namesExcludedProduct\(word, ?SHIRT_EXCLUDED_NOUNS\)/);
  assert.match(page, /excludedProductNouns\("tee"\)/);

  // D91: a bank saved before the rule existed must be repairable in one click.
  assert.match(page, /className="strip-mismatched"/,
    "No way to remove wrong-product phrases. Save is disabled while they exist, so the bank is locked.");

  /* D80: "Edit bank" must bring the form it just filled into view. The form
   * sits below the library, so the original scrollTo(0) scrolled away from it.
   * scrollIntoView does not work either — .management-page sets
   * overflow-x:clip, which makes it a clipping container that swallows the
   * call, so the page never moved. Scroll the window explicitly. */
  assert.doesNotMatch(page, /scrollIntoView/,
    "scrollIntoView is swallowed by the overflow-x:clip container on .management-page.");
  assert.doesNotMatch(page, /window\.scrollTo\(\{top:0/,
    "Scrolling to the top scrolls away from the edit form, which sits below the library.");
  /* And it must run in an EFFECT, not the click handler. Measured live on the
   * deployed build: scrolling from the handler was lost to React's re-render —
   * the page stayed at scrollY 0 across five samples while the editor sat 797px
   * below the fold, with the bank correctly loaded. See D115. */
  assert.match(page, /setSavedId\(list\.id\);setScrollToEditor\(true\)/,
    "Edit bank must flag the scroll, not perform it inline.");
  assert.match(page, /useEffect\(\(\)=>\{\s*if\(!scrollToEditor\)return;/);
  assert.match(page, /window\.scrollTo\(0,form\.getBoundingClientRect\(\)\.top\+window\.scrollY/);
  /* And not smoothly. Verified live: window.scrollTo({behavior:"smooth"}) never
   * moves the page on a management screen — scrollY stays 0 indefinitely —
   * while the same call without `behavior` scrolls instantly. */
  assert.doesNotMatch(page, /behavior:"smooth"/,
    "Smooth scrolling does not work on management screens. Scroll instantly.");
});

test("no auto-title path re-derives tags from the title — D79", async () => {
  const { readFile } = await import("node:fs/promises");
  const page = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Etsy title and tags are separate fields with separate limits. Deriving tags
   * from the finished title throws away every bank phrase over 20 characters:
   * on the real BACHELORETTE TEES bank that is 43 phrases down to 13 eligible,
   * so 13 tag slots got filled with 4-7 tags.
   *
   * The API now ranks tag candidates across the whole bank and returns them as
   * `tags`. Three client paths consume a title result — batch, individual, and
   * designs carried into a new batch. The carried path was still calling
   * tagsFromTitle and silently kept the old behaviour. */
  assert.doesNotMatch(page, /tagsFromTitle\(result\./,
    "An auto-title path is deriving tags from the title again. Use the `tags` the API returns.");
  assert.match(page, /tags:item\.result\.tags/, "batch path must use the ranked tags");
  const carried=page.slice(page.indexOf('async function continueBundle('),page.indexOf('async function createCustomShippingProfile('));
  assert.doesNotMatch(carried,/autoTitleForDesign/,'carrying a design must not trigger unrequested title generation');
  assert.match(page, /onApply\(result\.title,result\.tags,result\.titleWarning\)/, "individual path must use the ranked tags");
});

test("no management screen relies on scrollIntoView — it is clipped away", async () => {
  const { readFile } = await import("node:fs/promises");
  const files = ["keywords/page.tsx", "mockups/page.tsx", "batches/page.tsx", "usage/page.tsx"];

  /* app/management-aesthetic.css sets overflow-x:clip!important on
   * .management-page. `clip` makes it a clipping container, so scrollIntoView
   * resolves against an element that cannot scroll and silently does nothing —
   * no error, no console output, the page just never moves. Every one of these
   * screens carries .management-page, so the call is dead on all of them. */
  for (const file of files) {
    const source = await readFile(new URL(`../app/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /scrollIntoView/,
      `${file} calls scrollIntoView, which is a no-op under .management-page's overflow-x:clip. Use window.scrollTo with the element's own offset.`);
    assert.doesNotMatch(source, /behavior:"smooth"/,
      `${file} asks for a smooth scroll. Verified live: smooth scrolling never moves these pages. Scroll instantly.`);
  }
});

test("a thin title fails on its own length, not on phrase count — D77", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../app/api/listing-intelligence/route.ts", import.meta.url), "utf8");

  /* D77 is about listings that come out thin: one row produced 45 of 140
   * characters while its siblings produced 130.
   *
   * The first attempt to enforce this gated on phrase count (>=8). Measured
   * live on a real 3-design batch, that FAILED 2 of 3 listings — one of them
   * because it returned "7 of 8 required title phrases and 13 of 13 available
   * Etsy tags". Seven phrases and a full tag set is a good listing. Refusing
   * to build it is worse than the defect being fixed.
   *
   * The gate must judge the assembled title. */
  assert.match(route, /const TITLE_FILL_FLOOR=90;/);
  /* D438 · Still judged on the finished title's length rather than phrase count —
     it just warns now instead of refusing and discarding the title. */
  assert.match(route, /const titleIsShort=couldHaveDoneBetter&&title\.length<TITLE_FILL_FLOOR;/,
    "The gate must test the finished title's length.");
  assert.doesNotMatch(route, /selected\.length<minimumTitlePhrases\|\|tags\.length<requiredTagCount\)return NextResponse/,
    "Hard-failing a row on phrase count rejects good listings. Judge the assembled title instead.");
  // The retry itself may still use phrase count — it is cheap and harmless.
    /* D544 - kept only when the retry comes back richer than the first attempt. */
  assert.match(route, /selection=richer\(selection,await requestSelection\(1\)\)/);
});

test("both Printify product links work, and a bare id too — D116", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../app/api/printify/route.ts", import.meta.url), "utf8");

  /* The parser already accepted /editor/<id> and /products/<id>, so the product
   * page a seller is on while writing the description works — but the error
   * copy said "Paste a complete Printify product-editor link", which is
   * narrower than the truth and sends people back to the wrong page. A bare id
   * was rejected outright even though people copy it on its own. */
  assert.match(route, /const bare = value\.trim\(\);/);
  assert.match(route, /\/\^\[a-f0-9\]\{20,32\}\$\/i\.test\(bare\)/);
  assert.match(route, /Either the design-editor page or the product page works\./);
  assert.doesNotMatch(route, /Paste a complete Printify product-editor link\./,
    "The error must not claim only the editor link works.");
});

test("machine-default filenames do not become batch names — D142", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../app/api/batches/route.ts", import.meta.url), "utf8");

  /* Seen in Brittany's own Batch History:
   *   "ChatGPT Image Aug 21, 2026, 05 32 41 PM (2) + 3 more"
   *
   * `designLabel` cleaned the filename and that name took precedence over the
   * product name, so any seller uploading AI art, phone photos or screenshots —
   * which is most of them — gets batches named after a timestamp. A filename is
   * only a good batch name when a human chose it. */
  assert.match(route, /const GENERIC_DESIGN_NAME=/);
  assert.match(route, /chatgpt image\|dall\[- \]\?e\|midjourney/);
  assert.match(route, /if\(GENERIC_DESIGN_NAME\.test\(cleaned\)\)return "";/);
  assert.match(route, /const letters=cleaned\.replace\(\/\[\^a-z\]\/gi,""\)\.length;/,
    "A name that is mostly digits is a machine default too.");
});

/* D544 · Measured on her own batch, two listings, one bank, one run:
 *   "Bride Hoodie, Camp Bach, Lake Bachelorette"  — 42 chars,  3 of 13 tags
 *   "Bride Hoodie"                                — 12 chars, 13 of 13 tags
 * Etsy allows 140 title characters and 13 tag slots. The first listing shipped
 * with ten empty tag slots; the second used under a tenth of its title. Both
 * came from the same bank, which had plenty of fitting phrases for both.
 * Three separate causes, all pinned here. */
test("Etsy's title and tag space is filled when the bank can fill it — D544", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../app/api/listing-intelligence/route.ts", import.meta.url), "utf8");

  // 1. The retry is kept only when it is actually better than the first attempt.
  assert.match(route, /\(b\.selected\.length\+b\.tags\.length\)>\(a\.selected\.length\+a\.tags\.length\)\?b:a/);
  assert.match(route, /selection=richer\(selection,await requestSelection\(1\)\)/);

  /* 2. Tags: the fallback used to fire only on an empty list, so three tags out
        of thirteen was accepted in silence. The model's ranking leads and the
        bank fills the rest. */
  assert.match(route, /const rankedTagFallback=bestFitFromBank\(tagCandidates,designSignals,body\.product\)/);
  assert.match(route, /const pickedTags=withoutCaseCollisions\(\[\.\.\.tags,\.\.\.rankedTagFallback\]\)\.slice\(0,requiredTagCount\|\|13\)/);
  assert.doesNotMatch(route, /withoutCaseCollisions\(tags\.length\?tags:/,
    "a short tag list must be topped up, not accepted");

  /* 3. Title: TITLE_FILL_FLOOR already noticed a thin title and only warned about
        it. It fills it now, from the same ranked bank, without repeating a
        phrase already in the title or one contained in it. */
  assert.match(route, /if\(title\.length<90\)\{/);
  assert.match(route, /for\(const phrase of bestFitFromBank\(titleCandidates,designSignals,body\.product\)\)/);
  assert.match(route, /if\(already\.has\(phrase\.toLocaleLowerCase\(\)\)\|\|contained\(phrase\)\)continue/);
  assert.match(route, /if\(title\.length>=90\)break/);

  // And the 140 character ceiling still governs every phrase that goes in.
  assert.match(route, /const addPhrase=\(phrase:string\)=>\{const candidate=title\?`\$\{title\}\$\{joiner\}\$\{phrase\}`:phrase;if\(candidate\.length>140\)return/);
});

/* D551 · The answer to "why did this listing only get 3 of 13 tags", which she
 * had to ask because nothing on the page said it.
 *
 * Measured on her real banks: BACHELORETTE TEES holds 50 phrases and 30 of them
 * are longer than 20 characters, so they can never be Etsy tags - Etsy caps a tag
 * at 20. Twenty phrases were eligible before the product-noun filter had even
 * run. The bank page said "50 phrases" and nothing else. */
test("a keyword bank says how much of it can actually be a tag — D551", async () => {
  const { readFile } = await import("node:fs/promises");
  const [page, css, route] = await Promise.all([
    readFile(new URL("../app/keywords/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/clarity-pass.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/listing-intelligence/route.ts", import.meta.url), "utf8"),
  ]);

  // The count the page reports, and the count that matters, are both shown.
  assert.match(page, /const tagUsable=list\.keywords\.filter\(word=>word\.length<=20\)\.length/);
  assert.match(page, /short enough for Etsy tags/);

  // And the phrases that cannot be tags are marked where she can see which.
  assert.match(page, /className=\{word\.length>20\?"over-tag-limit":undefined\}/);
  assert.match(page, /too long for an Etsy tag, but usable in a title/);
  assert.match(css, /\.app-shell \.bank-grid span\.over-tag-limit\{/);

  /* The 20-character rule this reports is the same one the title builder applies
     when it decides what may become a tag. If that ever changes, this has to. */
  assert.match(route, /const tagCandidates=keywords\.filter\(keyword=>keyword\.length<=20/);
});
