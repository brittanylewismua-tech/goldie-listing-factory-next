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
  assert.match(page, /tags:result\.tags,titleWarning:result\.titleWarning/, "carried-designs path must use the ranked tags");
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
  assert.match(route, /if\(couldHaveDoneBetter&&title\.length<TITLE_FILL_FLOOR\)/,
    "The failure gate must test the finished title's length.");
  assert.doesNotMatch(route, /selected\.length<minimumTitlePhrases\|\|tags\.length<requiredTagCount\)return NextResponse/,
    "Hard-failing a row on phrase count rejects good listings. Judge the assembled title instead.");
  // The retry itself may still use phrase count — it is cheap and harmless.
  assert.match(route, /selection=await requestSelection\(1\)/);
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
