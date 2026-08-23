import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

/* Sizes were only ever settable in the Printify template. They are now a
 * selectable axis in Goldie, exactly like colour, so a seller sets their size
 * range once per saved product instead of remembering to set it in Printify.
 *
 * The governing safety property, which every test here defends:
 *   DEFAULT BEHAVIOUR MUST BE IDENTICAL TO BEFORE.
 * Only an explicit user action may change which variants go live, because this
 * is the code path that feeds pricing and Printify draft creation. */

test("the size axis is detected the same way colour is, and degrades safely", async () => {
  const route = await read("app/api/printify/route.ts");
  assert.match(route, /const sizeOption=found\.product\.options\?\.find\(option=>\/size\/i\.test/,
    "Size must be found by option type/name, mirroring colour.");
  /* If a blueprint has no identifiable size axis (a mug, a sticker), sizeIds is
   * empty, `others` collapses to the old `nonColors`, and selection is unchanged. */
  assert.match(route, /if\(!colorIds\.size&&!sizeIds\.size\)return Boolean\(variant\.is_enabled\)/);
  assert.match(route, /const others=\(variant\.options\|\|\[\]\)\.filter\(id=>!colorIds\.has\(id\)&&!sizeIds\.has\(id\)\)/);
  assert.match(route, /return others\.every\(id=>enabledOtherIds\.has\(id\)\)/);
});

test("axes that are not colour or size stay gated to the template", async () => {
  const route = await read("app/api/printify/route.ts");
  /* Style, paper, cut and similar are NOT selectable in Goldie. Offering
   * combinations for them would produce variants the seller cannot price. */
  assert.match(route, /const enabledOtherIds=new Set\(enabledVariants\.flatMap\(variant=>\(variant\.options\|\|\[\]\)\.filter\(id=>!colorIds\.has\(id\)&&!sizeIds\.has\(id\)\)\)\)/);
});

test("sizes are reported with the same shape colours use", async () => {
  const route = await read("app/api/printify/route.ts");
  assert.match(route, /sizeOptions:\(sizeOption\?\.values\|\|\[\]\)\.map\(value=>\(\{id:value\.id,title:[^)]*available:availableSizeIds\.has\(value\.id\),templateEnabled:templateSizeIds\.has\(value\.id\)\}\)\)/);
  assert.match(route, /sizeId:\(variant\.options\|\|\[\]\)\.find\(id=>sizeIds\.has\(id\)\)\|\|null/);
});

test("an empty size selection can never empty the variant set", async () => {
  const app = await read("app/listing-factory-app.tsx");
  /* This is the one failure here that costs money rather than looks wrong: an
   * empty variant set prices nothing and enables nothing on the Printify draft. */
  assert.match(app, /if\(!chosen\.size\)return byColor;/);
  assert.match(app, /return bySize\.length\?bySize:byColor;/);
});

test("batches saved before sizes existed behave exactly as they did", async () => {
  const app = await read("app/listing-factory-app.tsx");
  /* Their restored templateDetails has no sizeOptions and their variants carry no
   * sizeId, so they fall straight through the size filter. */
  assert.match(app, /if\(!templateDetails\?\.sizeOptions\?\.length\)return byColor;/);
});

test("D213: seeding stops at the recipe — the template is never a choice", async () => {
  const app = await read("app/listing-factory-app.tsx");

  /* This test used to require the opposite, in these words: "saved product
   * default -> this browser's last choice -> what the template had enabled ->
   * every available size", with a final assertion that the selection must never
   * be empty.
   *
   * That rule is wrong, and it is the one that matters most. The seller chooses
   * colors and sizes once, in the saved-product setup, and that becomes the
   * recipe. A product with no recipe defaults has NOT been set up. Falling back
   * to Printify's templateEnabled made it look decided and would publish in
   * colors the seller never picked; falling back to every available size was
   * worse still.
   *
   * Empty is the honest state. productReadiness already marks these facets
   * "ask", gates Continue, and opens the picker pre-selected with the template
   * as a suggestion the seller has to accept. */
  assert.match(app, /const rememberedSizes=rememberedSizeIds\.filter\(id=>sizeAvailable\.has\(id\)\)/);
  assert.match(app, /const sizeDefaults=rememberedSizes\.length\?rememberedSizes:sessionSizeIds;/);
  assert.doesNotMatch(app, /setSelectedSizeIds\(sizeDefaults\.length\?sizeDefaults:\[\.\.\.sizeAvailable\]\)/,
    "no all-available fallback");
  assert.doesNotMatch(app, /setSelectedColorIds\(defaults\.length\?defaults:\[\.\.\.available\]\)/,
    "no all-available fallback for colours either");
  assert.match(app, /const defaults=remembered\.length\?remembered:session;setSelectedColorIds\(defaults\);/);

  // A bundle member with no saved colours is left empty so its card asks.
  assert.match(app, /const ids=\(recipe\.defaultColorIds\|\|\[\]\)\.filter\(id=>available\.has\(id\)\);choices\[recipe\.id\]=ids/);
});

test("sizes survive a reload, a batch restore and a bundle hop", async () => {
  const app = await read("app/listing-factory-app.tsx");
  assert.match(app, /goldie-sizes-\$\{templateDetails\.id\}/, "per-product browser memory");
  assert.match(app, /selectedColorIds,selectedSizeIds,variantPrices/, "saved into the batch snapshot");
  assert.match(app, /setSelectedSizeIds\(state\.selectedSizeIds\?\.length\?state\.selectedSizeIds:state\.activeRecipe\?\.defaultSizeIds\?\.length\?state\.activeRecipe\.defaultSizeIds:savedProductSizes\)/, "restored with colour's precedence");
  assert.match(app, /loadTemplateUrl\(next\.templateUrl,nextPricing,Number\(next\.etsyShippingProfileId\)\|\|0,next\.defaultColorIds\|\|\[\],next\.defaultSizeIds\|\|\[\]\)/, "carried across a bundle hop");
});

test("a partial recipe save cannot wipe a stored default", async () => {
  const route = await read("app/api/product-recipes/route.ts");
  /* pricingJson is a blob that used to be rebuilt from scratch on every POST, so
   * any caller that did not resend a field wiped it — renaming a product through
   * the saved-products form would have dropped defaultSizeIds the same way it
   * could already drop a defaultProfitTarget. It now merges. */
  assert.match(route, /const patch: Record<string, unknown> = \{\};/);
  assert.match(route, /if \(body\.defaultSizeIds !== undefined\) patch\.defaultSizeIds/);
  assert.match(route, /\.\.\.existingSaved, \.\.\.patch \}/);

  /* Behavioural check of the merge semantics: an omitted key is preserved, an
   * explicitly empty list still clears. */
  const merge = (existing, body) => {
    const patch = {};
    if (body.defaultColorIds !== undefined) patch.defaultColorIds = body.defaultColorIds;
    if (body.defaultSizeIds !== undefined) patch.defaultSizeIds = body.defaultSizeIds;
    return { defaultColorIds: [], defaultSizeIds: [], ...existing, ...patch };
  };
  const stored = { defaultColorIds: [1, 2], defaultSizeIds: [14, 15, 16] };
  assert.deepEqual(merge(stored, { name: "renamed" }).defaultSizeIds, [14, 15, 16], "an omitted key survives a rename");
  assert.deepEqual(merge(stored, { defaultSizeIds: [] }).defaultSizeIds, [], "an explicit empty list still clears");
  assert.deepEqual(merge(stored, { defaultSizeIds: [14] }).defaultColorIds, [1, 2], "changing sizes leaves colours alone");
});

test("the saved product carries sizes everywhere it carries colours", async () => {
  const tools = await read("app/factory-tools.tsx");
  assert.match(tools, /defaultColorIds\?:number\[\];defaultSizeIds\?:number\[\]/);
  assert.equal((tools.match(/defaultSizeIds:existing\?\.defaultSizeIds/g) || []).length, 2,
    "both the POST body and the local Recipe object must carry it");
});

test("nothing still claims sizes can only be changed in Printify", async () => {
  const app = await read("app/listing-factory-app.tsx");
  assert.doesNotMatch(app, /Sizes come from your Printify product/,
    "The colour card used to say sizes live in Printify. That is now false.");
  assert.match(app, /function ProductSizeSelector/);
  /* A blueprint with no size axis renders nothing rather than an empty card. */
  assert.match(app, /if\(!sizes\.length\)return null;/);
});

test("the size card's promise matches what the gate actually enforces — D164", async () => {
  const app = await read("app/listing-factory-app.tsx");

  /* The card says "Choose at least one size before continuing". If nothing
   * enforced that, it would be a D154-class lie — a control telling the seller
   * they are blocked when they are not. Both the step gate and the forward
   * button now check sizes exactly as they check colours.
   *
   * The check is conditional on sizeOptions existing, so a blueprint with no
   * size axis, and any batch saved before sizes were selectable, is never
   * blocked by a rule that cannot apply to it. */
  assert.match(app, /const missingSizes=Boolean\(templateDetails\?\.sizeOptions\?\.length&&!selectedSizeIds\.length\)/);
  assert.match(app, /issues\.push\("Choose at least one product size for this batch\."\)/);
  assert.match(app, /Boolean\(templateDetails\?\.sizeOptions\?\.length\)&&!selectedSizeIds\.length\?"Choose product sizes to continue"/);
});

test("D213: \"Match Printify template\" matches the template, and nothing more", async () => {
  const app = await read("app/listing-factory-app.tsx");

  /* D164 made this button fall back to every available size when the template
   * had none enabled, to avoid leaving Continue blocked. So a control reading
   * "Match Printify template" could quietly select the entire blueprint — the
   * seller clicks a button naming one thing and gets another, in the one place
   * where the wrong answer publishes real listings.
   *
   * If there is nothing to match, match nothing. The facet stays unanswered,
   * the card keeps asking, and Continue stays gated with a label that says
   * which product needs what. */
  assert.match(app, /onChange\(templateSizes\)/);
  assert.doesNotMatch(app, /onChange\(templateSizes\.length\?templateSizes:available\.map\(size=>size\.id\)\)/);
});

test("the size block is stripped in every context the colour block is — D168", async () => {
  const globals = await read("app/globals.css");
  const clarity = await read("app/clarity-pass.css");

  /* The size card was added to product setup and to each bundle product without
   * those screens ever being rendered. Measured on a selected bundle:
   *   .product-color-selector  644px, margin 0, padding 0, border 0, transparent
   *   .product-size-selector   612px, margin 18px 16px, padding 20px, 1px border,
   *                            white .58 background
   * Two rules in globals.css strip the colour block inside .saved-product-batch-page
   * and .bundle-color-product. The size block had no equivalent, so it rendered as
   * a detached white box inset 16px inside a transparent section.
   * After: both contexts measure identical width and left edge. */
  assert.match(globals, /\.bundle-color-product \.product-size-selector\{width:100%;margin:0;padding:15px\}/);
  /* D236 · This rule flattens the panel's own card chrome because the panel now
     sits on a surface that already has chrome. It must NOT also zero the
     padding: that is what left the colour grid flush to the card edge for
     three deploys running. Padding has exactly one owner, in clarity-pass. */
  assert.match(globals, /\.saved-product-batch-page \.product-size-selector\{width:100%;margin:0;border:0;box-shadow:none;background:transparent\}/);
  assert.doesNotMatch(globals, /\.saved-product-batch-page \.product-size-selector\{[^}]*padding/,
    "a panel must never be stripped of its padding");
  assert.match(clarity, /\.app-shell \.saved-product-batch-page \.product-size-selector,\s*\n\.app-shell \.bundle-color-product \.product-size-selector\{[^}]*border-top:1px solid/,
    "Stripped of its own card, the size block needs a divider or it runs into the colour actions.");
});

test("print-quality decisions are grouped per design, not per design-and-product — D167", async () => {
  const app = await read("app/listing-factory-app.tsx");

  /* Measured by Brittany: a bundle of 3 products with 3 designs produced SIX
   * separate flagged pairs, each needing its own "Proceed anyway" click before
   * the batch could continue. The per-product detail is real — the same art can
   * be sharp on a tee and too small on a tote — but the decision belongs to the
   * design. Excluding still removes only the flagged pairs, so a design that is
   * fine on one product still publishes there. */
  assert.match(app, /const bundleQualityGroups=useMemo/);
  assert.match(app, /function decideQualityGroup\(keys:string\[\],value:"include"\|"exclude"\)/);
  assert.match(app, /function decideAllQuality\(value:"include"\|"exclude"\)/,
    "A bulk control is needed for the common case where the answer is the same.");
  assert.match(app, /\{bundleQualityGroups\.length\} of \{files\.length\}/,
    "The count must read in designs, which is what the seller uploaded.");

  const clarity = await read("app/clarity-pass.css");
  assert.match(clarity, /\.app-shell \.bundle-quality-bulk\{[^}]*justify-content:flex-end/,
    "The bulk actions sit right-aligned in the card.");
});

test("the size block strip lives in the layer that wins — D171", async () => {
  const clarity = await read("app/clarity-pass.css");

  /* D168 put the strip in globals.css. The base card rule for this block is in
   * clarity-pass.css, which loads last at equal specificity, so the strip lost.
   * Measured on the DEPLOYED build: colour 644px at x542, size still 612px at
   * x558 — the same detached box, "fixed" but not actually fixed.
   * After: 644/644 at x542 in setup, 650/650 at x539 in a bundle product. */
  assert.match(clarity, /\.app-shell \.saved-product-batch-page \.product-size-selector,\s*\n\.app-shell \.bundle-color-product \.product-size-selector\{[^}]*width:100%!important/,
    "The strip must be in clarity-pass, which loads last, or the base card rule wins.");
  assert.match(clarity, /\.app-shell \.saved-product-batch-page \.product-size-selector,[^{]*\{[^}]*background:transparent!important/);
});

test("one card renders a single product and every bundle member — D182", async () => {
  const app = await read("app/listing-factory-app.tsx");

  /* The batch page was the saved-product SETUP page, reused. bundleRecipes[0] got
   * promoted into a main slot and the rest went into an "other products" section.
   * Now there is one card component and one map: a single product is a list of
   * one, a bundle is a list of N, and nothing is promoted.
   *
   * Batch is a feature. The single-product path is the primary one and uses the
   * identical component. */
  assert.match(app, /\{\(activeBundle&&bundleRecipes\.length>1\?bundleRecipes:\(activeRecipe\?\[activeRecipe\]:\[\]\)\)\.map\(\(recipe,index\)=>\{/,
    "One map covers both paths.");
  /* D219 added a third class: in-batch, which tints the card and shows
     "Product N of M". A batch is the same four pages as a single product with
     one panel per product, so it has to be unmistakable which one you are on. */
  assert.match(app, /batch-product-card \$\{ready\.established\?"is-ready":"needs-setup"\} \$\{bundleSelected\?"in-batch":""\}/,
    "The card has two readiness states plus a batch marker.");
  assert.match(app, /Product \{index\+1\} of \{bundleRecipes\.length\}/,
    "Each card states its position in the batch.");
  assert.match(app, /const ready=readinessFor\(product,recipe\)/);
  assert.doesNotMatch(app, /OTHER PRODUCTS IN THIS BUNDLE/);
  assert.doesNotMatch(app, /className="bundle-color-selectors"/,
    "The afterthought section is gone.");

  /* Readiness is computed, never read from the flag that reports true for empty
   * recipes. */
  assert.match(app, /function readinessFor\(product:TemplateDetails,recipe:Recipe\|null\):Readiness/);
});

test("every setting a batch needs is a facet on the card — D182", async () => {
  const app = await read("app/listing-factory-app.tsx");

  /* Colours, sizes, mockups and the keyword bank were spread across a batch-level
   * colour block, a batch-level mockup picker, a "Saved for this product"
   * disclosure and a separate keyword prompt — four places, some of them
   * batch-level for settings that are per-product. All four are chips on the card,
   * and only the ones that still need an answer open a control. */
  /* D221 · The card carries product setup: colours, sizes, shipping, profit.
     Mockups went to the Images page with the photos and the keyword bank to the
     Listing page with the titles that use it — the D182 point stands, they are
     each in ONE place, just not all on this card. */
  for (const facet of ["colors", "sizes"])
    assert.match(app, new RegExp(`open==="${facet}"&&`), `${facet} must open from the card`);
  assert.doesNotMatch(app, /open==="shipping"&&/, "shipping lives in the pricing panel");
  assert.doesNotMatch(app, /open==="profit"&&/, "so does the profit goal");
  assert.doesNotMatch(app, /open==="mockups"&&/, "mockups belong to the Images page");
  assert.doesNotMatch(app, /open==="keywords"&&/, "the keyword bank belongs to the Listing page");
  assert.doesNotMatch(app, /className="saved-settings-summary"/,
    "The summary chips duplicated the card's chips.");
  assert.doesNotMatch(app, /className="keyword-bank-required"/,
    "The keyword prompt was a third place saying what the chip says.");

  /* Choosing something in a batch IS establishing the product, so it persists
   * immediately rather than behind a separate save-as-default button. */
  assert.match(app, /async function establish\(recipe:Recipe,change:Partial<Recipe>\)/);
  assert.match(app, /establish\(recipe,\{defaultColorIds:ids\}\)/);
  assert.match(app, /establish\(recipe,\{defaultSizeIds:ids\}\)/);
  /* D223 · Shipping and profit moved into the pricing panel, and establish moved
     with them — a value set there still becomes the product's default. */
  assert.match(app, /establish\(activeRecipe,\{etsyShippingProfileId:value\}\)/);
  assert.match(app, /establish\(activeRecipe,\{defaultProfitTarget:value\.targetProfit\}\)/);
  /* D221 · The keyword bank is chosen on the Listing page now, and still
     persists to the recipe from there. */
  assert.match(app, /establish\(activeRecipe,\{keywordListId:list\.id\}\)/);
});

test("Edit bundle visibly does something — D176", async () => {
  const tools = await read("app/factory-tools.tsx");

  /* Two faults, both mine. D169 gated the create/edit form on
   * !activeId.startsWith("bundle:") along with the grid — so once a bundle was
   * the selection there was NO way to edit it at all. And opening the form
   * scrolled nothing: it expands several hundred pixels down, behind the
   * "Want one batch to cover several products?" summary, so from anywhere but
   * the bottom of the page the button looked dead.
   *
   * The grid stays hidden when a bundle is selected (it was re-offering the
   * bundle you already picked); the form does not. */
  assert.doesNotMatch(tools, /\{!activeId\.startsWith\("bundle:"\)&&<details className="bundle-library"/,
    "The edit form must stay reachable while a bundle is selected.");
  assert.match(tools, /<details className="bundle-library" open=\{bundleForm\}>/);
  assert.match(tools, /document\.querySelector\("\.bundle-library"\)\?\.scrollIntoView\(\{block:"start"\}\)/,
    "Opening the form must bring it into view. Instant — smooth scrolling never fires here (D146).");
  /* And the header has to say what just happened, or it still reads as inert. */
  assert.match(tools, /\{bundleForm\?\(editingBundleId\?`Editing \$\{bundleName\|\|"this bundle"\}`:"New product bundle"\)/);
});

test("the setup screen does not announce itself twice — D177", async () => {
  const app = await read("app/listing-factory-app.tsx");

  /* Two banners sat above the setup, both reading "NEW BATCH · <product>":
   *   .product-setup-framing  "Goldie started with the choices saved for this product."
   *   .batch-page-intro       "Goldie started with the choices from your last batch."
   * Neither told the seller anything they could not see, and they contradicted
   * each other about where the defaults came from. Both removed.
   *
   * The first-run variant stays: a product that has never been set up genuinely
   * needs to be told nothing was copied from another product. */
  assert.doesNotMatch(app, /className="batch-page-intro"/);
  assert.doesNotMatch(app, /Goldie started with the choices/,
    "Steady-state 'we prefilled this' banners are noise on an already dense page.");
  assert.match(app, /activeRecipe\?\.setupComplete===false&&<div className="product-setup-framing first-product-setup">/,
    "First-run guidance is the only case that earns a banner.");
});



test("every product in a bundle needs its own keyword bank before continuing — D181", async () => {
  const app = await read("app/listing-factory-app.tsx");

  /* D180 made the keyword bank per-product. The forward gate still only checked
   * the ACTIVE product's bank, so a three-product bundle would pass setup with
   * one bank chosen and then reach product two with nothing to write titles from.
   *
   * Measured on the live account: all three saved products had keywordListId
   * "(none)", so this was not hypothetical. */
  assert.match(app, /const bundleKeywordGaps=useMemo\(\(\)=>\{/);

  /* D221 · The rule is unchanged; it moved pages. The bank is chosen on the
     Listing page, where the titles that consume it are written, so gating the
     PRODUCT page on it was blocking Continue on a decision made two pages later.
     The gate now applies to the step that needs it, and still names the products
     that are missing one rather than saying something is wrong. */
  assert.match(app, /if\(step==="finish"&&bundleKeywordGaps\.length\)issues\.push\(`Choose a keyword bank for \$\{bundleKeywordGaps\.join\(", "\)\}\.`\)/,
    "The Listing step names the products still missing a bank.");
  assert.doesNotMatch(app, /\|\|bundleKeywordGaps\.length>0\|\|/,
    "and the Product page no longer blocks on it");
});

test("shipping, profit and Etsy details are per-product facts — D183", async () => {
  const app = await read("app/listing-factory-app.tsx");

  /* These three lived in "Saved for this product", a single batch-level block —
   * the same mistake as the batch-level mockup picker. In a bundle they were
   * silently the active product's values presented as the batch's.
   *
   * They now compute per product and render on that product's card. Shipping
   * copies the profile Printify already attached when the product was published
   * to Etsy, which is a required setup step, so it is rarely a question at all. */
  assert.match(app, /shippingProfiles:etsyShippingProfiles\.map\(profile=>\(\{id:profile\.id,title:friendlyShippingProfileTitle\(profile\.title\)/);
  assert.match(app, /templateShippingProfileId:Number\(product\.shippingTemplateId\)\|\|0/);
  assert.match(app, /etsyShippingProfileId:recipe\?\.etsyShippingProfileId,defaultProfitTarget:recipe\?\.defaultProfitTarget,etsyDefaults:recipe\?\.etsyDefaults/);

  /* D209 supersedes the second half of this test. It used to assert that
   * shipping, profit and Etsy details opened the legacy .everything-else block
   * and scrolled to it — a deliberate choice at the time, and wrong in use:
   * clicking Shipping threw the seller to the foot of the page, to an uncarded
   * "<product> settings" block with a stray Profit goal above it, and in a
   * bundle that block always showed the ACTIVE product regardless of which
   * row was clicked. Shipping and profit now open in the card, scoped to the
   * row's recipe. What survives here is the per-product computation above.
   *
   * Etsy details still uses the scroll-away path, and keeps this assertion. */
  /* D221 · The product card is product setup only: colours, sizes, shipping,
     profit. Mockups moved to the Images page with the photos and the keyword
     bank to the Listing page with the titles that use it — they were asked in
     two places, and the Product page blocked Continue on a choice made two pages
     later. Their rules are unchanged and still covered, in
     tests/product-readiness.test.mjs against the exported facet functions. */
  /* D223 · The card is colours and sizes; the pricing panel beneath it owns the
     profit goal and the shipping profile, because the per-variant prices are
     computed from them. Keeping them on the card too put two controls for one
     value on one screen. */
  assert.match(app, /const inCard=\["colors","sizes"\]\.includes\(facet\.name\);/);
/* D237 · This used to assert the row handler opened `.everything-else`. D232
     deleted that block, so the assertion was pinning a querySelector that could
     only ever return null — five dead buttons per card, and a test that called
     it correct. Assert the destinations RESOLVE instead: every facet must point
     at a step and a selector that is really rendered somewhere in the app. */
  const table = app.slice(app.indexOf("export const FACET_DESTINATION"));
  const rows = [...table.slice(0, table.indexOf("};")).matchAll(
    /(\w+):\{step:"(\w+)",selector:"\.([\w-]+)"\}/g)];
  assert.ok(rows.length >= 5, "every non-in-card facet needs a destination");
  for (const [, facet, step, cls] of rows) {
    assert.ok(["setup", "designs", "finish"].includes(step), `${facet} -> unknown step ${step}`);
    assert.ok(app.includes(`"${cls}`) || app.includes(`${cls}"`) || app.includes(`${cls} `),
      `${facet} points at .${cls}, which is rendered nowhere`);
  }
  assert.doesNotMatch(app, /querySelector<[^>]*>\("\.everything-else"\)|querySelector\("\.everything-else"\)/,
    "nothing may look up the block D232 deleted");
  /* The destination no longer has to be a <details> to open — the settings live
     on their own steps now — but it must still be brought into view, or the row
     appears to do nothing even when the navigation worked. */
  assert.match(app, /block\.scrollIntoView\(\{block:"start"\}\)/,
    "a facet row must bring its destination into view");
  assert.match(app, /if\(dest\.step!==workflowStep\)goToStep\(dest\.step\)/,
    "and must switch steps when the destination lives on another one");
});

test("the product step does not also collect designs — D184", async () => {
  const app = await read("app/listing-factory-app.tsx");

  /* Measured on the deployed build: 538px of dropzone, quota and "before
   * uploading" copy rendered at the top of step 2, while "Add designs" is step 3.
   * One job in two places, and it was the first thing on a step called
   * "Choose product". */
  assert.match(app, /\$\{workflowStep==="designs"\|\|\(workflowStep==="finish"&&finishPhase==="details"\)\?"active-panel":"hidden-panel"\}/,
    "The designs panel belongs to the designs step, not the product step.");
});

test("opening a facet shows the choices, not a summary — D187", async () => {
  const app = await read("app/listing-factory-app.tsx");

  /* ProductColorSelector collapses behind a "Change colors" summary when
   * `remembered` is true, and captions itself "From your last batch — change any."
   * Wiring the card with `remembered` meant clicking the Colours chip produced a
   * collapsed summary you had to click again, captioned with a last batch that
   * never happened. Opening the chip IS the request to choose. */
  assert.doesNotMatch(app, /onRemember=\{\(\)=>\{\}\} remembering=\{false\} remembered[ /]/,
    "The card's pickers must open expanded.");
  assert.equal((app.match(/onRemember=\{\(\)=>\{\}\} remembering=\{false\} remembered=\{false\} inCard\/>/g) || []).length, 2);
});

test("a suggestion is never displayed as a decision — D189/D191", async () => {
  const app = await read("app/listing-factory-app.tsx");
  const clarity = await read("app/clarity-pass.css");

  /* Seen on the deployed build: the Colours chip read "Choose" while the picker
   * beneath read "6 selected" — those six being the template's colors, a
   * suggestion and not a decision.
   *
   * The first fix labelled it "Confirm 6", which was jargon: it never said what
   * was being confirmed or where the number came from. D191 states the action
   * plainly and puts the shortcut next to it, naming its source. */
  assert.doesNotMatch(app, /Confirm \$\{suggestedCount\}/);
  assert.match(app, /Use Printify&rsquo;s \{suggestion\} \{facet\.name==="colors"\?/,
    "D204: the label names the noun as well as the source.");
  assert.match(app, /className="batch-product-rows"/);
  assert.match(clarity, /\.app-shell \.batch-product-rows\{/);
});

test("the product photo is visible against the card — D188/D192", async () => {
  const clarity = await read("app/clarity-pass.css");
  /* Superseded by D192: the fix was never the plate colour. `contain` letterboxed
   * the whole catalog frame — mostly empty studio background — into 52px, so the
   * garment was a few pixels tall. cover crops to it. */
  assert.match(clarity, /\.app-shell \.bundle-product-photo\{[^}]*object-fit:cover!important/);
  assert.doesNotMatch(clarity, /\.bundle-product-photo\{[^}]*object-fit:contain/);
});

test("a suggestion has exactly one control — D193", async () => {
  const app = await read("app/listing-factory-app.tsx");

  /* D191 moved the suggestion shortcut into its row ("Use Printify's 4"), but the
   * standalone confirm bar underneath the list survived the edit — so the card
   * showed two controls for the same action: the row button, and
   * "Goldie suggests 4 colors from your Printify product. [Use these]". */
  assert.doesNotMatch(app, /className="facet-confirm"/,
    "The standalone confirm bar is replaced by the row shortcut.");
  assert.doesNotMatch(app, /Goldie suggests \{/);
  assert.match(app, /Use Printify&rsquo;s \{suggestion\} \{facet\.name==="colors"\?/,
    "D204: the label names the noun as well as the source.");
});

test("the product photo picks the catalog shot that actually shows the garment — D194", async () => {
  const app = await read("app/listing-factory-app.tsx");
  const route = await read("app/api/printify/route.ts");

  /* Blueprint catalog images are inconsistent: some are model shots, some are a
   * white garment on a white background that reads as a blank square at 52px
   * however it is cropped or filtered. Measured across three products — the
   * hoodie and sweatshirt have usable shots at index 0, the tee does not.
   *
   * Rather than trusting index 0, the client samples the first few candidates and
   * keeps the one with the most non-background pixels. A white-on-white frame
   * scores near zero and loses. */
  assert.match(route, /previewImages:\(blueprint\.images\|\|\[\]\)\.slice\(0,6\)/);
  assert.match(app, /function pickProductPhoto\(product:TemplateDetails\)/);
  /* D200 retires the D194 metric. "Most non-background pixels" rewards whatever
   * fills the frame, and on the live tee that was a macro shot of a folded
   * corner (99% ink) while the only usable flat lay ranked last (64%). Scoring
   * moved to app/product-photo.ts and is covered by tests/product-photo.test.mjs;
   * what remains asserted here is that the client still samples rather than
   * trusting index 0. */
  assert.doesNotMatch(app, /if\(v<225\)ink\+\+/, "the inverted D194 metric is gone");
  assert.match(app, /photoStats\(ctx\.getImageData/, "scoring runs through the shared module");
  assert.match(app, /if\(candidates\.length<2\)return product\.previewImage/,
    "One candidate is not a choice — do not probe.");
  /* next/image shadows the global Image constructor in this file. */
  assert.match(app, /const image=document\.createElement\("img"\)/);
});

test("D207: a bundle facet shortcut never writes another product's choice into the active one", async () => {
  const app = await read("app/listing-factory-app.tsx");

  /* Live, on a three-product bundle: clicking "Use Printify's 3 colors" on the
   * crewneck card wrote those ids into the global selectedColorIds, which price
   * and validate the ACTIVE product — the hoodie. The hoodie has no variants in
   * crewneck colours, so pricedVariants emptied and Continue threw
   * "The selected colors do not contain any available variants" over cards that
   * all showed Colors ✓.
   *
   * The pickers already guarded this with isActive and wrote to
   * bundleColorChoices / bundleSizeChoices for inactive members. The row
   * shortcut was the one path that skipped the guard. */
  const shortcut = app.slice(app.indexOf('className="row-shortcut"'));
  const handler = shortcut.slice(0, shortcut.indexOf("</button>"));

  assert.match(handler, /if\(isActive\)\{setSelectedColorIds\(ids\);setPricingApproved\(false\)\}else setBundleColorChoices/);
  assert.match(handler, /if\(isActive\)\{setSelectedSizeIds\(ids\);setPricingApproved\(false\)\}else setBundleSizeChoices/);
  assert.doesNotMatch(
    handler,
    /const ids=facet\.suggested\?\.colorIds\|\|\[\];setSelectedColorIds\(ids\)/,
    "the unguarded write is gone",
  );
  // The choice must still persist to the recipe either way.
  assert.match(handler, /void establish\(recipe,\{defaultColorIds:ids\}\)/);
  assert.match(handler, /void establish\(recipe,\{defaultSizeIds:ids\}\)/);
});

test("D207: the dead-end variant message names the product and says what to do", async () => {
  const app = await read("app/listing-factory-app.tsx");
  const code = app.replace(/\/\*[\s\S]*?\*\//g, "");

  /* "The selected colors do not contain any available variants." names no
   * product — useless in a bundle — and no action. */
  assert.doesNotMatch(code, /"The selected colors do not contain any available variants\."/);
  assert.match(app, /No color and size combination you picked is available for \$\{templateDetails\?\.blueprintTitle\|\|"this product"\}/);
  assert.match(app, /Open its Colors or Sizes and choose a pairing Printify offers/);
});

test("D209: every readiness row that offers to open, opens in the card", async () => {
  const app = await read("app/listing-factory-app.tsx");

  /* Four of seven rows opened in the card. Shipping, Profit and Etsy details
   * were wired to `.everything-else` — a legacy <details> at the foot of the
   * page — so clicking Shipping scrolled you away from the card entirely, to a
   * bare "<product> settings" block with a stray Profit goal above it. */
  /* D221 · The product card is product setup only: colours, sizes, shipping,
     profit. Mockups moved to the Images page with the photos and the keyword
     bank to the Listing page with the titles that use it — they were asked in
     two places, and the Product page blocked Continue on a choice made two pages
     later. Their rules are unchanged and still covered, in
     tests/product-readiness.test.mjs against the exported facet functions. */
  /* D223 · The card is colours and sizes; the pricing panel beneath it owns the
     profit goal and the shipping profile, because the per-variant prices are
     computed from them. Keeping them on the card too put two controls for one
     value on one screen. */
  assert.match(app, /const inCard=\["colors","sizes"\]\.includes\(facet\.name\);/);

  // Both new panels render inside the card, scoped to the row's own recipe.
  /* D223 · These two moved into the pricing panel below the card. */
  assert.doesNotMatch(app, /row-panel shipping-row-panel/);
  assert.doesNotMatch(app, /row-panel profit-row-panel/);

  /* D211 · The panels are SIBLINGS of .batch-product-rows, both direct children
     of .batch-product-card — the same slot the colour picker uses. The D209 CSS
     was written as a descendant of .batch-product-rows and therefore selected
     nothing at all. Pin the relationship so the stylesheet can be checked
     against it rather than against its own spelling. */
  /* D218 supersedes the placement this used to assert. The panels rendered
     AFTER the whole row list, so opening Colours put the palette below Etsy
     details and the seller had to scroll past six rows to reach it. They are
     emitted inside the row map now, immediately after the row that opened them,
     through panelFor. */
  const panelForAt = app.indexOf("const panelFor=(open:string)=>");
  const rowsAt = app.indexOf('className="batch-product-rows"');
  assert.ok(panelForAt > 0, "panels are built by panelFor in the card scope");
  assert.ok(panelForAt < rowsAt, "panelFor is defined before the row list renders");

  // Every in-card facet must still have a panel inside that function.
  const body = app.slice(panelForAt, rowsAt);
  for (const facet of ["colors", "sizes"]) {
    assert.match(body, new RegExp(`open==="${facet}"`), `${facet} still has a panel`);
  }

  // And the row emits it directly beneath itself, not after the list.
  assert.match(app, /<\/div>\{isOpen\(facet\.name\)\?panelFor\(facet\.name\):null\}<\/Fragment>/,
    "the panel follows its own row");
  /* D223 · Shipping and profit moved into the pricing panel, and establish moved
     with them — a value set there still becomes the product's default. */
  assert.match(app, /establish\(activeRecipe,\{etsyShippingProfileId:value\}\)/);
  assert.match(app, /establish\(activeRecipe,\{defaultProfitTarget:value\.targetProfit\}\)/);

  /* The legacy block reads activeRecipe, so in a bundle it always showed the
     active product. These panels must read the row's recipe instead. */
  /* D223 · per-product scoping for these now lives in the pricing panel. */
});

test("D209: a row never offers to Close a panel it cannot open", async () => {
  const app = await read("app/listing-factory-app.tsx");

  /* The open facet defaults to the first unanswered question. On the hoodie
   * that was "shipping", which never opens in the card — so the button read
   * "Close", and clicking it scrolled to the bottom of the page. */
  /* D210 goes further: a row that navigates somewhere else says so. Etsy
     details is the only row left outside the card, and "Change" promised
     editing in place before throwing the seller 1,487px down the page. */
  /* D232 · Every facet on the card opens in the card, so there is no
     "Open settings" branch left — the block it pointed at is gone. */
  assert.match(app, /\{isOpen\(facet\.name\)\?"Close":needed\?"Choose":"Change"\}/);
  assert.doesNotMatch(app, /"Open settings"/);

});

test("D210: profit and shipping exist in exactly one place", async () => {
  const app = await read("app/listing-factory-app.tsx");
  const block = app.slice(app.indexOf("everything-else-body"), app.indexOf("</details>", app.indexOf("everything-else-body")));

  /* D209 put profit and shipping in the readiness card but left the originals
   * in the legacy settings block, so two controls wrote the same value — and
   * the block's copies read activeRecipe, meaning in a bundle they edited a
   * different product than the row the seller came from. */
  assert.doesNotMatch(block, /<b>Profit goal<\/b>/, "profit lives in the card only");
  assert.doesNotMatch(block, /<b>Shipping profile<\/b>/, "shipping lives in the card only");
  assert.doesNotMatch(block, /Shipping profile for this batch/);

  // What legitimately remains there.



  // Landing 1,487px away needs a signal it is the thing you clicked.
  assert.match(app, /block\.classList\.add\("just-opened"\)/);
  const css = await read("app/clarity-pass.css");
  assert.match(css, /\.app-shell \.everything-else\.just-opened\{/);
});

test("D211: the row-panel stylesheet selects the element it is written for", async () => {
  const css = await read("app/clarity-pass.css");
  const app = await read("app/listing-factory-app.tsx");
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");

  /* Measured on the deployed D209 build: the panel computed padding 0, no
   * background, no border — every rule written for it matched nothing, because
   * `.batch-product-rows .row-panel` describes a descendant and the panel is a
   * sibling. The D209 test passed the whole time; it asserted the text was in
   * the file, not that it selected anything. Same failure as D179. */
  assert.doesNotMatch(rules, /\.batch-product-rows\s+\.row-panel/,
    "a descendant selector here matches nothing");
  /* D234 · This assertion pinned a DIRECT-CHILD selector. D218 then moved the
     panels inside .batch-product-rows so each opens under its own row — and the
     selector went dead while this test kept passing, because it only ever checked
     that the text existed in the file. That is the exact failure D211 was written
     to prevent, repeated inside the test meant to prevent it.
     The selectors are descendants now, and the assertion pins the DOM
     relationship as well as the rule. */
  /* D235 · .row-panel went with the shipping and profit panels in D223. What this
     rule now covers is the colour and size selectors, which is where the padding
     was missing. */
  assert.match(rules, /\.app-shell \.batch-product-card \.product-color-selector,/);
  assert.doesNotMatch(rules, /\.batch-product-card>\.(row-panel|product-color-selector|product-size-selector)/,
    "a direct-child selector breaks the moment a panel is renested");

  /* The panel really is a direct child of the card. The card's class is built
     from a template literal, so it is not the string `className="batch-product-card`. */
  assert.match(app, /batch-product-card \$\{ready\.established/);
  assert.doesNotMatch(app, /row-panel shipping-row-panel/);

  /* The 93-option shipping select that needed min-width:0 and max-width:100% was
     in .row-panel. D223 moved shipping into the pricing panel, which has its own
     layout and was measured clean on the live page, so there is no longer a rule
     here to assert. Recorded rather than deleted silently: the constraint still
     matters wherever a long-option select sits inside a fixed-width card. */
  assert.doesNotMatch(rules, /row-panel/, "the panel this guarded no longer exists");
});

test("D222: a product cannot join a bundle until it has been set up", async () => {
  const tools = await read("app/factory-tools.tsx");

  /* Creating a product means going through its setup. Colours and sizes are the
   * seller's choices and cannot be inherited from the Printify template, so a
   * product with neither has not been set up. Letting one into a bundle is how
   * an unconfigured product reached a batch and had to be answered for there —
   * the thing the recipe exists to prevent. */
  assert.match(tools, /export function recipeIsSetUp\(recipe: Recipe\)/);
  assert.match(tools, /return Boolean\(\(recipe\.defaultColorIds \|\| \[\]\)\.length\) && Boolean\(\(recipe\.defaultSizeIds \|\| \[\]\)\.length\);/);
  assert.match(tools, /disabled=\{!recipeIsSetUp\(recipe\)\|\|/, "the checkbox is disabled");
  assert.match(tools, /Finish this product’s setup first/, "and the row says why, not just a tooltip");

  const body = tools.slice(tools.indexOf("export function recipeIsSetUp"));
  const source = body.slice(0, body.indexOf("\n}") + 2).replace("export function recipeIsSetUp(recipe: Recipe)", "function recipeIsSetUp(recipe)");
  const recipeIsSetUp = new Function(`${source}; return recipeIsSetUp;`)();

  assert.equal(recipeIsSetUp({ defaultColorIds: [1], defaultSizeIds: [2] }), true);
  assert.equal(recipeIsSetUp({ defaultColorIds: [1] }), false, "colours alone is not set up");
  assert.equal(recipeIsSetUp({ defaultSizeIds: [2] }), false, "sizes alone is not set up");
  assert.equal(recipeIsSetUp({}), false);
  assert.equal(recipeIsSetUp({ defaultColorIds: [], defaultSizeIds: [] }), false);
});

test("D222: the Images page continues to Listing, not past it to Publish", async () => {
  const app = await read("app/listing-factory-app.tsx");

  /* The photo control used to end the mockups PHASE and jump to final review.
   * With photos on the Images PAGE that would skip Listing entirely - titles,
   * tags, descriptions and Etsy details - and land on Publish. */
  const button = app.slice(app.indexOf('className="workflow-next mockup-next"'));
  const handler = button.slice(0, button.indexOf("</button>"));
  assert.match(handler, /setFinishPhase\("details"\)/, "Images advances to the Listing page");
  assert.doesNotMatch(handler, /setFinishPhase\("final"\)/, "not straight to Publish");
  assert.match(handler, /Continue to titles/);
});

test("D228: an empty colour or size selection is never written to a recipe", async () => {
  const app = await read("app/listing-factory-app.tsx");

  /* Measured on the live account across one session: Gildan Tee held five saved
   * colours in the morning and zero by the afternoon, while the hoodie and
   * crewneck kept theirs. A recipe with no colours is not a preference — it is a
   * product that can no longer be used — and the loss is silent, because the
   * card simply stops mentioning colours.
   *
   * Clearing a selection for the current batch stays possible. Erasing the
   * product's saved setup does not. */
  const unguarded = app.match(/(?<!if\(ids\.length\))void establish\(recipe,\{default(Color|Size)Ids:ids\}\)/g) || [];
  assert.deepEqual(unguarded, [], "every write of colours or sizes must require at least one id");

  assert.equal((app.match(/if\(ids\.length\)void establish\(recipe,\{defaultColorIds:ids\}\)/g) || []).length, 2);
  assert.equal((app.match(/if\(ids\.length\)void establish\(recipe,\{defaultSizeIds:ids\}\)/g) || []).length, 2);

  const readiness = await read("app/product-readiness.ts");
  assert.match(readiness, /NEVER persist an empty colour or size selection to a recipe/);
});
