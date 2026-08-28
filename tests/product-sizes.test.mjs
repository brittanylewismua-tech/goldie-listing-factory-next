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
  /* D328 · The filter moved into variantsFor(details,…) so every product in a
     bundle can price from its own template. The guard itself is unchanged — it
     is now written against the passed-in details rather than the active
     product's. */
  assert.match(app, /if\(!details\?\.sizeOptions\?\.length\)return byColor;/,
    "a template with no size axis still falls straight through")
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
  /* Whitespace-tolerant: D373 moved this into a helper, and the rule is what
     matters, not the line it sits on. */
  assert.match(app, /const ids=\(recipe\.defaultColorIds\|\|\[\]\)\.filter\(id=>available\.has\(id\)\);\s*choices\[recipe\.id\]=ids/);
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
  /* D392 · Was 2. The POST no longer echoes colours and sizes back - the form
     does not edit them, and a stale echo overwrote fresh choices. The local
     Recipe object still carries them so the card does not blank out after a
     save. One site, deliberately. */
  assert.equal((tools.match(/defaultSizeIds:existing\?\.defaultSizeIds/g) || []).length, 1,
    "the local Recipe object must still carry it");
  assert.equal((tools.match(/defaultColorIds:existing\?\.defaultColorIds/g) || []).length, 1);
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
  /* D383 · The forward button used to relabel itself with whatever was missing
     ("Pick a keyword bank for Gildan Hoodie", "Choose product colors to
     continue"). It says "Next step" on every step now; the gate dialog names
     each unfinished item when you press it. What still has to hold is the
     ENFORCEMENT, which is what these assert. */
  /* D462 · The same enforcement, moved into productStepBlocker so the button can
     also say what it is waiting for - and so a product with no colour axis, like
     a ceramic mug, is not asked for a colour it does not have. */
  assert.match(app, /templateDetails\?\.sizeOptions\?\.length&&!selectedSizeIds\.length\)return "Choose at least one size for this product\."/,
    "a product with a size axis still cannot move forward without sizes");
  assert.match(app, /templateDetails\?\.colorOptions\?\.length&&!selectedColorIds\.length\)return "Choose at least one colour for this product\."/,
    "and colours are required only when the product offers them");
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
  assert.match(app, /const ready=readinessFor\(product,recipe,isActive\?pricingApproved:Boolean\(bundleApproved\[recipe\.id\]\)\)/);
  assert.doesNotMatch(app, /OTHER PRODUCTS IN THIS BUNDLE/);
  assert.doesNotMatch(app, /className="bundle-color-selectors"/,
    "The afterthought section is gone.");

  /* Readiness is computed, never read from the flag that reports true for empty
   * recipes. */
  /* D393 · Readiness now takes the approval state, because a card that says
     "Ready" while the forward gate demands approval is two parts of one screen
     disagreeing about the same fact. */
  assert.match(app, /function readinessFor\(product:TemplateDetails,recipe:Recipe\|null,approved\?:boolean\):Readiness/);
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
  /* D334 · Colours, sizes, pricing and shipping are now four panels on the ONE
     product card, because in a bundle the risk is losing track of which product
     you are configuring. Every decision for a product lives in that product's
     card; moving to the next card is moving to the next product. */
  for (const facet of ["profit", "shipping"])
    assert.match(app, new RegExp(`open==="${facet}"&&`), `${facet} must open from the card too`);
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
  assert.match(app, /establish\(recipe,\{etsyShippingProfileId:value\}\)/);
  assert.match(app, /establish\(recipe,\{defaultProfitTarget:value\.targetProfit\}\)/);
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
/* D302 · The disclosure now IS the create action, so it carries an onToggle.
     `open={bundleForm}` still has to drive it — that is what makes "Edit bundle"
     on a saved bundle card open this block with the form already filled in. */
  assert.match(tools, /<details className="bundle-library" open=\{bundleForm\} onToggle=/);
  assert.match(tools, /if\(open&&!bundleForm&&recipes\.length>=2&&!pendingAction\)openBundle\(\)/,
    "opening the section must open the form, not reveal a second button");
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
  /* D457 · Even the first-run banner is gone now. It framed a decision the
     seller does not have to make - the product keeps its own defaults from the
     moment they are chosen - so the page carries no banner at all. */
  assert.doesNotMatch(app, /product-setup-framing first-product-setup/,
    "nothing on this page announces itself any more.");
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
  assert.match(app, /const inCard=\["colors","sizes","profit","shipping"\]\.includes\(facet\.name\);/);
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
  /* D387 · This panel used to stay active through step 3 because it held the
     titles editor. That editor moved into the product card, so the panel is now
     only the uploader, and only the designs step shows it. */
  assert.match(app, /\$\{workflowStep==="designs"\?"active-panel":"hidden-panel"\}/,
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
  /* D297 · These two were the arity check for the card's pickers. They were also
     the evidence that both "Save these as this product's default…" buttons were
     wired to a no-op: onRemember={()=>{}} with remembering and remembered hard
     false, so the button could not act and could not report. They now call
     saveProductDefaults and reflect its state. */
  assert.equal((app.match(/onRemember=\{\(\)=>void saveProductDefaults\(/g) || []).length, 2);
  assert.doesNotMatch(app, /onRemember=\{\(\)=>\{\}\}/,
    "a save button may not be wired to a no-op");
  assert.match(app, /remembering=\{savingProductDefault===`colors:\$\{recipe\.id\}`\}/);
  /* D306 · The saved state is derived from the selection, not from a timer, so
     "✓ Saved for this product" holds until a colour or size actually changes. */
  assert.match(app, /remembered=\{sameIdSet\(shownSizes,recipe\.defaultSizeIds\)\}/);
  assert.match(app, /remembered=\{sameIdSet\(shownColors,recipe\.defaultColorIds\)\}/);
  assert.doesNotMatch(app, /setSavedProductDefault/,
    "a confirmation must not expire on a timer while the seller is looking at it");
});

test("a suggestion is never displayed as a decision — D189/D191", async () => {
  /* D388 · The row shortcut this guarded is gone at her direction: Printify's
     template is not a choice the seller made, and one-click adopting it is how a
     product ends up in colours nobody picked. Kept as a tombstone so the button
     is not quietly reintroduced. */
  const app = await read("app/listing-factory-app.tsx");
  assert.doesNotMatch(app, /className="row-shortcut"/);

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
  /* D388 · The row shortcut this guarded is gone at her direction: Printify's
     template is not a choice the seller made, and one-click adopting it is how a
     product ends up in colours nobody picked. Kept as a tombstone so the button
     is not quietly reintroduced. */
  const app = await read("app/listing-factory-app.tsx");
  assert.doesNotMatch(app, /className="row-shortcut"/);

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
  /* D388 · The row shortcut this guarded is gone at her direction: Printify's
     template is not a choice the seller made, and one-click adopting it is how a
     product ends up in colours nobody picked. Kept as a tombstone so the button
     is not quietly reintroduced. */
  const app = await read("app/listing-factory-app.tsx");
  assert.doesNotMatch(app, /className="row-shortcut"/);

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
  assert.match(app, /const inCard=\["colors","sizes","profit","shipping"\]\.includes\(facet\.name\);/);

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
  /* D499 gave the bundle cards on steps 2-4 the same row markup, and those
     render earlier in the file, so this has to look at step 1's own row list
     rather than the first one anywhere. */
  const rowsAt = app.indexOf('className="batch-product-rows"', panelForAt);
  assert.ok(panelForAt > 0, "panels are built by panelFor in the card scope");
  assert.ok(panelForAt < rowsAt, "panelFor is defined before the row list renders");

  // Every in-card facet must still have a panel inside that function.
  const body = app.slice(panelForAt, rowsAt);
  for (const facet of ["colors", "sizes"]) {
    assert.match(body, new RegExp(`open==="${facet}"`), `${facet} still has a panel`);
  }

  // And the row emits it directly beneath itself, not after the list.
  /* D329 · The panel still follows its own row; it now carries a closing control
     at its foot as well, so after scrolling a 39-colour grid the way out is
     where you already are rather than back at the top. */
  assert.match(app, /<\/div>\{isOpen\(facet\.name\)\?<>\{panelFor\(facet\.name\)\}/,
    "the panel follows its own row");
  assert.match(app, /className="panel-collapse-foot" onClick=\{\(\)=>toggle\(facet\.name\)\}/,
    "and closes from the bottom as well as the top");
  /* D223 · Shipping and profit moved into the pricing panel, and establish moved
     with them — a value set there still becomes the product's default. */
  assert.match(app, /establish\(recipe,\{etsyShippingProfileId:value\}\)/);
  assert.match(app, /establish\(recipe,\{defaultProfitTarget:value\.targetProfit\}\)/);

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
  /* D427 - this now lives on the single footer button. There used to be a
   * second copy in the card list; it looked identical and skipped the photo
   * check, so it was removed rather than kept in sync. */
  const button = app.slice(app.indexOf("disabled={imagesStepIssues().length>0}"));
  const handler = button.slice(0, button.indexOf("</button>"));
  assert.match(handler, /setFinishPhase\("details"\)/, "Images advances to the Listing page");
  assert.doesNotMatch(handler, /setFinishPhase\("final"\)/, "not straight to Publish");
  assert.match(handler, /createdListingsMissingImages/, "and still gates on every listing having a photo");
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

  /* D388 · Was 2 each. The "Use Printify's N colors" shortcut was the second
     call site and it is gone. The guard itself is unchanged. */
  assert.equal((app.match(/if\(ids\.length\)void establish\(recipe,\{defaultColorIds:ids\}\)/g) || []).length, 1);
  assert.equal((app.match(/if\(ids\.length\)void establish\(recipe,\{defaultSizeIds:ids\}\)/g) || []).length, 1);

  const readiness = await read("app/product-readiness.ts");
  assert.match(readiness, /NEVER persist an empty colour or size selection to a recipe/);
});

/* D293 · A disabled control must say why it is disabled. The bundle editor
   capped at 4 products and required 2, and enforced both by nothing more than
   `disabled` — the same defect as the dead facet rows in D237: the control is
   present, it does nothing, and the screen never explains it. */
test("bundle limits explain themselves — D293", async () => {
  const tools = await read("app/factory-tools.tsx");

  assert.match(tools, /bundleIds\.length>=4\)\?"A bundle holds up to 4 saved products/,
    "the capped checkbox must carry the reason");
  assert.match(tools, /className="bundle-rule"/,
    "and the rule must be on screen, not only in a title attribute");
  assert.match(tools, /Choose at least 2 saved products/,
    "the minimum must be stated too");

  /* The enforcement itself must stay. */
  assert.match(tools, /bundleIds\.length>=4/);
  assert.match(tools, /bundleIds\.length<2/);
});

/* D294 · The Etsy details card read "3/3 ready" directly above three rows each
   reading "0 of 1 required set". Both were right about different things: the
   pill counted listings that HAD an Etsy object, the rows counted required
   properties actually filled. One word, two meanings, on the screen that gates
   publishing to Etsy. */
test("Etsy readiness means required properties are set — D294", async () => {
  const app = await read("app/listing-factory-app.tsx");

  assert.match(app, /export function etsyRequiredComplete/);
  assert.match(app, /required\.every\(property=>Boolean\(\(property\.value\|\|""\)\.trim\(\)\)\)/,
    "ready must mean every required property carries a value");

  assert.doesNotMatch(app, /files\.every\(file=>file\.etsy\)/,
    "no gate may treat the mere presence of an Etsy object as readiness");
  assert.doesNotMatch(app, /etsyReadyCount=files\.filter\(file=>file\.etsy\)\.length/,
    "and neither may the count behind the pill");

  /* D295 · Fixing the obvious spelling left three more. "Ready" was written
     four different ways and my first pass only matched one of them, so the
     pill still read 3/3 ready on the deployed page above three rows saying
     0 of 1 required set. Every GATE must use the helper. */
  for (const gate of [
    /files\.filter\(file=>etsyRequiredComplete\(file\.etsy\)\)\.length\}\/\{files\.length\} ready/,
    /etsyDetailsReady:files\.length>0&&files\.every\(file=>etsyRequiredComplete/,
    /chosenFiles\.some\(file=>!etsyRequiredComplete\(file\.etsy\)\)/,
    /const unfinished=files\.filter\(file=>!etsyRequiredComplete\(file\.etsy\)\)/,
  ]) assert.match(app, gate);

  /* But the prefill bookkeeping legitimately asks "does this file have an Etsy
     object yet", and must NOT be swept up in that. */
  assert.match(app, /files\.filter\(file=>!file\.etsy&&file\.title\.trim\(\)\)/,
    "the prefill queue still asks whether prefill has happened at all");
});

/* D310 · A panel sized width:100% cannot also carry horizontal margins: the two
   rules add up and the overflow lands entirely on the right. Measured on the
   deployed card — 718px panel, 720px card, 22px margins, right edge 21px past
   the card. This is the same class of bug as D211 and D234: two rules describing
   the same box without agreeing. */
test("an in-card panel's margins are not cancelled by its width — D310", async () => {
  const clarity = await read("app/clarity-pass.css");
  const block = clarity.slice(clarity.indexOf("D310 ·"));
  assert.match(block, /width:auto!important/,
    "the panel must yield its width to the margins, not overflow past them");
  assert.match(block, /max-width:none!important/);
});

/* D312 · D187 fixed "opening a facet shows the choices, not a summary". D306
   then made `remembered` true whenever the selection matches the saved default
   — which is ALWAYS, now that selections auto-save — and `expanded` is
   initialised from `!remembered`. So clicking Colors reopened the collapsed
   summary and demanded a second click. Regressed the exact defect D187 names,
   in the commit after it. In the card, opening the row IS the request. */
test("a card picker always opens on the choices — D312", async () => {
  const app = await read("app/listing-factory-app.tsx");
  assert.match(app, /useState\(inCard\?true:!remembered\)/,
    "in the card the picker opens expanded regardless of remembered");
  assert.doesNotMatch(app, /useState\(!remembered\)/,
    "remembered must not decide whether the grid is shown in the card");

  /* And the IN-CARD copy must not still offer a save that now happens by
     itself. Outside the card — the bundle editor — nothing auto-saves, so the
     original wording there is correct and must survive. */
  assert.match(app, /inCard\?<p className="panel-help">Every change saves to this product automatically\.<\/p>/);
  assert.match(app, /unless you save them as the product default/,
    "the non-card head still describes a real, manual save");
});

/* D315 · "Match Printify template" existed on sizes and not on colours, though
   both option types carry templateEnabled and both rows already offer the
   Printify shortcut. One capability, present in one panel and missing from the
   other. D213's rule holds for the new one too: an empty template matches
   nothing rather than quietly selecting the whole blueprint. */
test("both pickers can match the Printify template — D315", async () => {
  const app = await read("app/listing-factory-app.tsx");
  assert.equal((app.match(/Match Printify template<\/button>/g) || []).length, 2,
    "colours and sizes each offer it");
  assert.match(app, /colorOptions\|\|\[\]\)\.filter\(color=>color\.available&&color\.templateEnabled\)/);
  assert.match(app, /sizeOptions\|\|\[\]\)\.filter\(size=>size\.available&&size\.templateEnabled\)/);
  assert.doesNotMatch(app, /Matching Printify-cost groups still share one price/,
    "D314 · the whole-number confirmation must not explain interface mechanics");
});

/* D318 · The colour and size pickers do the same job and kept drifting apart —
   "Match Printify template" on sizes only (D315), "Done choosing colors" and
   "Clear all" on colours only. Pin the pair together so the next change to one
   has to be made to both. */
test("the colour and size pickers offer the same actions — D318", async () => {
  const app = await read("app/listing-factory-app.tsx");
  const actions = (cls) => {
    const seg = app.slice(app.indexOf(`className="${cls}"`));
    return [...seg.slice(0, 1600).matchAll(/>([A-Z][^<{>]{3,44})<\/button>/g)].map((m) => m[1]);
  };
  assert.deepEqual(actions("size-selector-actions"), actions("color-selector-actions"),
    "both pickers must offer the same actions in the same order");

  /* "Done choosing colors" collapsed the panel — a job the row's Close button
     already does for both pickers. */
  assert.doesNotMatch(app, /onClick=\{\(\)=>setExpanded\(false\)\}>Done choosing/);
});

/* D323 · Clicking Edit on a saved product opened the form below the saved
   bundles and the bundle disclosure — a long way from the tile that was
   clicked, and often off screen. The form edits products, so it belongs
   directly under them. */
test("the product edit form renders under the products it edits — D323", async () => {
  const tools = await read("app/factory-tools.tsx");
  const productsGrid = tools.indexOf('className="recipe-grid"');
  const form = tools.indexOf('className="recipe-form"');
  const bundles = tools.indexOf("bundle-card-heading");
  assert.ok(productsGrid >= 0 && form >= 0 && bundles >= 0);
  assert.ok(form > productsGrid, "the form comes after the products it edits");
  assert.ok(form < bundles, "and before the saved bundles, not after them");
});

/* D322 · Step 1 renamed itself once a product was selected — "Choose product"
   became "Build this batch" — so the page appeared to become a different page
   mid-step, and the new name described the whole flow rather than the step,
   while the rail and eyebrow both still read PRODUCT. */
test("step 1 keeps one title in both states — D322", async () => {
  const app = await read("app/listing-factory-app.tsx");
  assert.doesNotMatch(app, /title: "Build this batch"/,
    "a step may not rename itself when something is selected");
  assert.equal((app.match(/title: "Choose product"/g) || []).length, 2,
    "both branches of step 1 use the name the rail already uses");
});

/* D324 · Twice now the pricing section has shown prices that do not meet the
   profit goal beside it. First because nothing ever calculated them (D320 —
   they were the Printify template's own prices). Then because the calculation
   ran ONCE, at whatever the target happened to be at that moment, and a later
   change to the goal did not recompute: $31.59 cost under a $10 goal showed
   $55.84, which is exactly a $18.50 target.

   The invariant: while pricing is unapproved and untouched, the prices ARE the
   goal's output and must follow it. */
test("unapproved prices follow the profit goal — D324", async () => {
  const app = await read("app/listing-factory-app.tsx");

  assert.match(app, /if\(!variants\.length\|\|approved\|\|manualPriceEdit\.current\)return;/,
    "recalculation stops at approval or a hand-edited price, and nowhere else");
  /* D350 · Depends on the VALUES, not the objects. D334 renders PricingReview
     per bundle product and builds `variants` and `pricing` inline in the map, so
     object identity changes on every render — which turned this effect into an
     infinite loop that hung the page before it finished loading. */
  assert.match(app, /\},\[variantKey,pricingKey,pricesKey,approved\]\);/,
    "it re-runs when a price should change, not when React re-renders");
  assert.match(app, /const variantKey=variants\.map\(variant=>`\$\{variant\.id\}:\$\{variant\.cost\}`\)\.join\(","\);/);
  assert.match(app, /const pricingKey=`\$\{pricing\.targetProfit\}/);
  assert.match(app, /function changeCostGroupPrice\(cost:number,cents:number\)\{manualPriceEdit\.current=true;/,
    "editing a price by hand must stop the goal overwriting it");

  /* The arithmetic the effect leans on, checked directly. */
  const price = (31.59 + 10 + 0.45) / (1 - 0.095);
  const profit = price - 31.59 - price * 0.095 - 0.45;
  assert.equal(price.toFixed(2), "46.45");
  assert.equal(profit.toFixed(2), "10.00");
});

/* D324b · The reason D320 silently never ran: loading a product fills the price
   map with Printify's template prices, so a guard of "only calculate when no
   price is set" is a guard that never passes. Nothing may gate recalculation on
   the price map being empty. */
test("recalculation is not gated on an empty price map — D324", async () => {
  const app = await read("app/listing-factory-app.tsx");
  assert.match(app, /setVariantPrices\(Object\.fromEntries\(\(result\.product\.variants\|\|\[\]\)\.map\(variant=>\[String\(variant\.id\),variant\.templatePrice\]\)\)\)/,
    "loading a product still seeds the map from the template");
  assert.doesNotMatch(app, /if\(Object\.keys\(prices\)\.length\)return;/,
    "so an empty-map guard can never fire and must not be used");
});

/* D325/D326 · The combobox that replaced the native select regressed two things.
   It showed "Choose your Etsy shipping profile" even when Goldie had already
   inherited the profile the product ships with — that profile IS the default
   until the seller picks another (D296). And it sits inside `.pricing-controls`,
   which paints every button it contains solid plum with !important, so 94
   option rows became 94 filled buttons. */
test("the shipping combobox shows its default and its rows are not buttons — D325", async () => {
  const app = await read("app/listing-factory-app.tsx");
  const css = await read("app/clarity-pass.css");

  /* D327 · The default is the PRINTIFY TEMPLATE's profile for this product,
     preselected until the seller saves a choice of their own. D325 tried to do
     this from `attachedProfile`, which is derived from selectedProfileId — so
     when nothing was selected there was nothing to fall back to and the fix did
     nothing at all. */
  assert.match(app, /:templateProfile\?shippingProfileOptionLabel\(templateProfile\)/,
    "the trigger shows the template's profile rather than an empty prompt");
  assert.match(app, /const fromTemplate=profiles\.find\(profile=>profile\.id===Number\(templateShippingProfileId\|\|0\)\);/,
    "the template id is matched against the seller's real Etsy profiles first");
  assert.match(app, /if\(fromTemplate\)onSelectProfile\(fromTemplate\.id\);/,
    "and only selected when it resolves — an unmatched id is the D231 deadlock");
  assert.match(app, /templateShippingProfileId=\{Number\(details\.shippingTemplateId\)\|\|0\}/,
    "and the value has to reach PricingReview at all");

  const block = css.slice(css.indexOf("D326 ·"));
  assert.match(block, /\.app-shell \.pricing-controls \.shipping-combobox-option/,
    "options must beat the .pricing-controls button fill");
  assert.match(block, /background:transparent!important/);
});

test("loading a template applies its verified Etsy shipping profile immediately — D329", async () => {
  const app = await read("app/listing-factory-app.tsx");
  assert.match(app, /const verifiedProfileId=Number\(result\.product\.shippingTemplateId\)\|\|0;/);
  /* D333 · Applied only when nothing is chosen yet. selectRecipe sets the
     seller's saved profile immediately before this, so setting it
     unconditionally replaced a saved choice with the template's on every
     selection. Keeping what is current preserves both behaviours. */
  assert.match(app, /if\(verifiedProfileId\)setEtsyShippingProfileId\(current=>current\|\|verifiedProfileId\);/);
});

test("saved-product and shipping guidance stays plain and brief — D331", async () => {
  const app = await read("app/listing-factory-app.tsx");
  assert.match(app, /Your saved product will keep working if the original Etsy listing sells out, becomes inactive, or is deleted\. Just keep the product in Printify\./);
  assert.match(app, /Goldie starts with the shipping profile already used for this product\. Change it only if needed\./);
});

/* D332 · A bundle showed ONE pricing card — the active product's — and no way
   to price the others at all. Colours and sizes were already per product; only
   pricing was still a single set of globals. Each product carries its own
   template, costs, profit goal and shipping profile, which is exactly what its
   recipe already stores. */
test("every bundle product gets its own pricing card — D332", async () => {
  const app = await read("app/listing-factory-app.tsx");

  assert.match(app, /function variantsFor\(details:TemplateDetails\|null\|undefined,colorIds:number\[\],sizeIds:number\[\]\)/,
    "the variant filter must take a product rather than close over the active one");
  /* D334 · These started as separate cards below the product cards, which split a
     product's colours from its prices. They are panels on the product's own card
     now, so the assertion is that the pricing panel is built per recipe. */
  assert.match(app, /const pricingPanelFor=\(which:"prices"\|"shipping"\)=>\{/,
    "each product card builds its own pricing and shipping panels");
  for (const [state, why] of [
    ["bundlePrices", "prices"],
    ["bundlePricing", "profit goal"],
    ["bundleShipping", "shipping profile"],
    ["bundleApproved", "approval"],
  ]) assert.ok(app.includes(`${state}[recipe.id]`), `${why} is per product`);

  /* Each product's own choices persist to its own recipe, not the active one. */
  assert.match(app, /void establish\(recipe,\{defaultProfitTarget:value\.targetProfit\}\)/);
  assert.match(app, /void establish\(recipe,\{etsyShippingProfileId:value\}\)/);

  /* One panel at a time: only the first product opens. */
  /* D334 · With four panels on the card, only the FIRST panel of the FIRST
     product opens. Everything else is one click away, so selecting a bundle
     never lands you in three open colour grids. */
/* D356 · ONE default, used by both the render and the toggle. They each had
     their own and disagreed, so the first click on a row started from a list
     that did not match the screen and opened panels the seller had not asked
     for. */
/* D361 · Nothing opens by default — opening Colours for the first product chose
     the seller's starting point for them and hid the other three categories
     behind a swatch grid. */
  assert.match(app, /const defaultOpenFacets:string\[\]=\[\];/);
  assert.match(app, /const openList=openFacet\[recipe\.id\]\?\?defaultOpenFacets;/);
  assert.match(app, /const list=current\[recipe\.id\]\?\?defaultOpenFacets;/,
    "the toggle must start from the same list that is on screen");
  assert.doesNotMatch(app, /current\[recipe\.id\]\?\?\["colors","sizes"\]/,
    "a second, stale default is what caused the bouncing");
  assert.match(app, /role=\{inCard\?"button":undefined\}/,
    "the row itself opens its panel, not only the Change button");
});

/* D335 · The Printify link is the source of truth for a saved product — it is
   what Goldie verifies, and what the name is derived from. It used to sit BELOW
   a name field, so the seller had to invent a name before Goldie knew what the
   product was. Link first, name filled in from the verified Printify brand and
   model, and still editable. */
test("the Printify link comes before the product name — D335", async () => {
  const tools = await read("app/factory-tools.tsx");
  const link = tools.indexOf("<span>Printify product link</span>");
  const name = tools.indexOf("<span>Product name</span>");
  assert.ok(link >= 0 && name >= 0);
  assert.ok(link < name, "the link is pasted first; the name comes from it");

  /* The auto-name must stay overridable — a manual edit has to survive a
     re-verify, which is what nameTouched guards. */
  assert.match(tools, /if\(nameTouched\.current\|\|editingId\|\|!props\.suggestedProductName\)return;/);
  assert.match(tools, /setName\(props\.suggestedProductName\);/);
});

/* D337 · D334 moved pricing and shipping onto the product card, but the card
   renders ONE ROW PER FACET and productReadiness had been cut back to colours
   and sizes only. So the panels had no rows to attach to and never appeared,
   while the old standalone pricing block kept rendering below every product —
   which is exactly the split D334 existed to remove. */
test("the card has a row for every panel it can open — D337", async () => {
  const readiness = await read("app/product-readiness.ts");
  const app = await read("app/listing-factory-app.tsx");

  assert.match(readiness, /const facets = \[colorFacet\(input\), sizeFacet\(input\), profitFacet\(input\), shippingFacet\(input\)\];/,
    "every in-card panel needs a facet, or its row does not exist");

  const inCard = app.match(/const inCard=\[([^\]]*)\]/);
  assert.ok(inCard, "the in-card list must exist");
  for (const facet of ["profit", "shipping"])
    assert.ok(inCard[1].includes(`"${facet}"`), `${facet} opens in the card`);

  /* And the standalone block must not double up underneath a bundle. */
  /* D353 · There is no standalone pricing card to gate any more. Every
     selection renders a product card — a single product is a bundle of one —
     and pricing and shipping are panels on it. D337 narrowed the standalone
     block to single products, which fixed the duplicate under a bundle and left
     the identical duplicate under an individual product. */
  assert.doesNotMatch(app, /pricedVariants\.length>0&&<PricingReview/,
    "pricing lives on the product card, nowhere else");
  assert.match(app, /const pricingPanelFor=\(which:"prices"\|"shipping"\)=>\{/);
});

/* D338 · The card's rows were sorted so anything unset floated to the top, so a
   product missing a shipping profile showed Shipping first and Colors third.
   The categories moved depending on what happened to be missing, which makes
   position useless for finding anything. Fixed order, always. */
test("card rows keep a fixed order regardless of state — D338", async () => {
  const app = await read("app/listing-factory-app.tsx");
  const readiness = await read("app/product-readiness.ts");

  assert.doesNotMatch(app, /\[\.\.\.ready\.facets\]\.sort\(/,
    "rows may not be reordered by whether they are set");
  assert.match(readiness, /\[colorFacet\(input\), sizeFacet\(input\), profitFacet\(input\), shippingFacet\(input\)\]/,
    "and the order comes from the facet list: colours, sizes, pricing, shipping");

  /* D344 · An open panel names itself larger. It must NOT also print the product
     name: .row-label is a fixed grid column, so the name wrapped and collided
     with the value beside it — and the card header above already shows the
     product and is sticky, so it is on screen the whole time anyway. */
  assert.doesNotMatch(app, /row-label-product/,
    "the sticky card header already names the product");
  const css = await read("app/clarity-pass.css");
  assert.match(css, /\.batch-product-row\.open \.row-label\{[\s\S]{0,200}white-space:nowrap!important/,
    "an enlarged label may not wrap inside its column");
});

/* D345 · Refresh must change nothing. D301 remembered the selected RECIPE only,
   so refreshing with a bundle selected restored whichever single product had
   been chosen last. A bundle is a selection too. */
test("a refresh restores a selected bundle, not the last product — D345", async () => {
  const app = await read("app/listing-factory-app.tsx");
  assert.match(app, /window\.localStorage\.setItem\("goldie-active-bundle"/,
    "choosing a bundle remembers it");
/* D354 · The clear lives in chooseRecipe, not selectRecipe. selectRecipe is the
     shared loader — useBundle calls it for the bundle's first product, so
     clearing there erased the bundle key a moment after useBundle wrote it and
     left a breadcrumb pointing at that first member. That is what kept
     restoring a single product. */
  assert.match(app, /try\{window\.localStorage\.removeItem\("goldie-active-bundle"\)\}catch\{[^}]*\}setActiveBundle\(null\)/,
    "choosing a single product is what forgets a bundle");
  assert.doesNotMatch(app, /setItem\("goldie-active-recipe",recipe\.id\);window\.localStorage\.removeItem\("goldie-active-bundle"\)/,
    "the shared loader must not decide what was selected");
  assert.match(app, /if\(bundle&&\(saved\.recipeIds\|\|\[\]\)\.length\)\{await useBundle\(bundle,saved\.recipeIds\|\|\[\]\);return\}/,
    "the bundle is restored through the same path that selects one normally");
  assert.match(app, /activeRecipe\|\|activeBundle\|\|signedIn!==true\)return;/,
    "and a restore never fights a selection already made");
});

/* D346/D347 · Two labels that explained instead of showed. */
test("the card header marks attention without a bare count — D347", async () => {
  const app = await read("app/listing-factory-app.tsx");
  const tools = await read("app/factory-tools.tsx");
  assert.doesNotMatch(app, /\$\{ready\.questions\.length\} to set/,
    "a count with no noun says a number but not what it counts");
  assert.match(app, /aria-label=\{ready\.established\?"Ready":`\$\{ready\.questions\.length\}/,
    "the full sentence still reaches screen readers and hover");
  assert.doesNotMatch(tools, /Named from the Printify product/,
    "a filled-in text field does not need to say it can be edited");
});

/* D348 · The shipping dropdown was clipped and could not be scrolled, and its
   matches came back in shop order. */
test("the shipping dropdown escapes its card and ranks matches — D348", async () => {
  const app = await read("app/listing-factory-app.tsx");
  const css = await read("app/clarity-pass.css");

  /* .step-card sets overflow:hidden for its corners, and the panel is absolutely
     positioned inside one — so the list was cut at the card edge and the part
     you needed to scroll to was never rendered. */
  assert.match(css, /\.step-card:has\(\.shipping-combobox-panel\)/,
    "the card must let an open dropdown out");
  assert.match(css, /max-height:min\(320px,42vh\)!important/,
    "and the list is bounded by the viewport, not the card");

  assert.match(app, /if\(title===normalizedProfileSearch\)return 0;/,
    "an exact name match comes first");
  assert.match(app, /if\(title\.startsWith\(normalizedProfileSearch\)\)return 1;/);
});

/* D352 · The rail digits rendered in Helvetica Neue at weight 400 — nothing set
   a family on them, so they fell back to the system font while the rest of the
   app is Manrope and DM Serif. That, plus proportional figures and a digit
   centred on the em box rather than its cap height, is why they read as stock. */
test("the rail digits use the app's own type — D352", async () => {
  const css = await read("app/clarity-pass.css");
  const app = await read("app/listing-factory-app.tsx");
  const block = css.slice(css.indexOf("D352 · THE RAIL NUMBERS"));

  assert.match(block, /font-family:"Manrope"/, "not a system fallback");
  assert.match(block, /font-variant-numeric:tabular-nums lining-nums!important/,
    "so 1 and 4 occupy the same width and sit identically in their circles");

  assert.doesNotMatch(app, /String\(position\+1\)\.padStart\(2,"0"\)/,
    "four steps do not need to be written 01 to 04");
});

/* D351 · The sidebar goal reads as its own thing rather than a second usage
   meter, and says what the number means before saying the number. */
test("the sidebar goal names the period — D351", async () => {
  const app = await read("app/listing-factory-app.tsx");
  assert.match(app, /className="listing-goal-caption">This \{listingGoal\.period\}&rsquo;s goal<\/span>/);
  assert.match(app, /<b>\{goalDone\} of \{listingGoal\.target\}<\/b>/,
    "progress only — still no deficit, and the count is not capped");
});

/* D357 · "Powered by Goldie AI" is the widest line in the sidebar, so it sets
   the column's visual edge. Above the copyright and the Etsy notice it made
   those two look indented. At the bottom the block reads as one left-aligned
   stack that widens as it descends. */
test("the sidebar closes with Powered by Goldie AI — D357", async () => {
  const app = await read("app/listing-factory-app.tsx");
  const powered = app.indexOf('className="approved-powered"');
  const etsy = app.indexOf('className="etsy-api-disclosure"');
  const copyright = app.indexOf("© 2026 Be A Wolf Biz");
  assert.ok(powered > 0 && etsy > 0 && copyright > 0);
  assert.ok(powered > copyright, "it sits below the copyright");
  assert.ok(powered > etsy, "and below the Etsy notice, so it is genuinely last");
});

/* D363 · Approved is a state, not an action. The button used to stay on screen
   after approval wearing an "✓ approved" label — a control asking for something
   already done. Any change to prices, the profit goal or the shipping profile
   clears approval, so the button returns on its own when there is something to
   approve again. */
test("the approve button leaves once there is nothing to approve — D363", async () => {
  const app = await read("app/listing-factory-app.tsx");
  assert.match(app, /\{approved\s*\?<p className="pricing-approved-state"/,
    "approved renders as a state");
  assert.doesNotMatch(app, /approved\?"✓ Prices and shipping approved"/,
    "not as a button label");
  /* The three things that must invalidate it, so it can come back. */
  for (const handler of [/onPricing=/, /onPrices=/, /onSelectProfile=/])
    assert.match(app, handler);
  assert.match(app, /setPricingApproved\(false\)/);
});

/* D365 · Once a bundle is selected the bundle grid hides, so choosing the wrong
   one meant starting the batch over. The link sits under the card that shows the
   current selection, and goes through changeProduct() so it asks before
   discarding work exactly as Change product does. */
test("a selected bundle can be swapped for another — D365", async () => {
  const tools = await read("app/factory-tools.tsx");
  assert.match(tools, /activeId\.startsWith\("bundle:"\)&&<button type="button" className="change-bundle-link"/);
  assert.match(tools, /onClick=\{\(\)=>\{if\(!props\.onChangeProduct\(\)\)return;setActiveId\(""\)/,
    "it reuses the confirm-and-clear path rather than inventing a second one");

  const block = tools.indexOf('className="selected-summary-block"');
  const link = tools.indexOf('className="change-bundle-link"');
  assert.ok(block > 0 && link > block, "the link belongs to the card it changes");
});

/* D385 · One card with one spinner while a bundle loads, then every product
   revealed together. D373 revealed each product the moment it landed, which
   meant cards appearing one at a time and the page reflowing underneath her.
   Fetching stays parallel - only the reveal is batched. */
test("D385: a loading bundle is one card with one spinner", async () => {
  const app = await read("app/listing-factory-app.tsx");
  const tools = await read("app/factory-tools.tsx");
  assert.match(tools, /className="goldie-spinner"/);

  assert.match(app, /className="batch-product-card bundle-loading-card"/,
    "one card, not a line of prose and not one skeleton per product");
  assert.match(app, /Loading \{list\.length\} \{list\.length===1\?"product":"products"\}/);
  assert.doesNotMatch(app, /Loading \{recipe\.name\}/,
    "a line per product is what this replaced");
  assert.doesNotMatch(app, /product-card-skeleton/,
    "and a skeleton card per product is not one card either");

  /* Nothing is revealed until everything has arrived. */
  assert.match(app, /if\(!product\|\|anyPending\)return null/,
    "no product card renders while any of them is still loading");
  assert.doesNotMatch(app, /setBundleColorProducts\(current=>\(\{\.\.\.current,\[recipe\.id\]:details\}\)\)/,
    "revealing each product as it lands is the bug");

  /* Parallel fetching stays - it is only the reveal that is batched. */
  assert.match(app, /await Promise\.all\(recipes\.filter\(recipe=>recipe\.id!==recipes\[0\]\.id\)/);
});

/* D378 · Steps 2-4 carry the same product cards as step 1. Two traps in that
   change, both caught here rather than in a screenshot:

   1. The Images drafts panel stays mounted across steps so a run in progress is
      never torn down. Its visibility therefore has to move to the card rail as a
      CLASS, not by conditionally rendering the wrapper - otherwise switching
      steps remounts a panel mid-run.
   2. Once the panel's own class is hardcoded to active-panel, the rail owns the
      hidden state. If no product is chosen there is no card to draw, and
      returning the body bare would show a panel that is meant to be closed. */
test("D378: steps 2-4 wrap their work in the same product card as step 1", async () => {
  const app = await read("app/listing-factory-app.tsx");

  assert.match(app, /stepProductCards\(bundleCardStatus\("images"\)/);
  assert.match(app, /stepProductCards\(bundleCardStatus\("listing"\)/);
  assert.match(app, /stepProductCards\(bundleCardStatus\("publish"\)/);

  /* Same card element as step 1, so the two screens cannot drift apart. */
  assert.match(app, /className=\{`batch-product-card step-product-card /);

  /* D381 · The first version stripped the drafts panel's own hidden state and
     handed it to the rail, which hid itself with a class - and .hidden-panel
     lost to .app-shell .step-product-cards{display:grid} in the built
     stylesheet. Result: step 2's "Create your Printify drafts" panel rendered
     on step 1. Two independent guards now, because one was clearly not enough. */
  assert.match(app, /launch-panel workflow-panel \$\{workflowStep==="designs"\?"active-panel":"hidden-panel"\}/,
    "the panel must keep hiding itself, whatever the rail does");
  assert.match(app, /style=\{hidden\?\{display:"none"\}:undefined\}/,
    "and the rail must hide with an inline style, which cannot lose to a cascade");
  assert.doesNotMatch(app, /step-product-cards \$\{hidden\?"hidden-panel":""\}/,
    "hiding this with a class is the bug");
  /* D486 moved the panel from the open card's body to a footer under all the
     cards, so the condition now sits in the third argument rather than at the
     end of the call. The guarantee is unchanged: the rail is handed exactly the
     condition the panel applies to itself. */
  assert.match(app, /,null,!\(workflowStep==="designs"\),<aside/,
    "and the rail is handed the same condition the panel applies to itself");
});

test("D378: any product card can be opened, not only the next one", async () => {
  const app = await read("app/listing-factory-app.tsx");
  assert.match(app, /const \[bundleBatchIds,setBundleBatchIds\]/,
    "each bundle member is its own batch; without the map only forward works");
  assert.match(app, /bundleRecipes,bundleIndex,bundleBatchIds,/,
    "and it has to survive a refresh like everything else on these steps");
  assert.match(app, /function openBundleProduct\(index:number\)/);
  assert.match(app, /if\(index===bundleIndex\+1\)void continueBundle\(\)/,
    "a product with no batch yet is the one case continueBundle still handles");
});

/* D379 · Opening a product card on steps 2-4 first did window.location.assign:
   a full page load, blank screen, everything refetched, scroll thrown to the
   top. Step 1 opens a card instantly, so cards that look the same behaved
   completely differently. Loading a batch is now a function that can be called
   in place, and the switch flushes the outgoing product's save first — the
   autosave is debounced, so without the flush the last keystrokes would either
   be lost or land on the product being switched to. */
test("D379: opening a product card does not reload the page", async () => {
  const app = await read("app/listing-factory-app.tsx");

  assert.doesNotMatch(app, /window\.location\.assign\(/,
    "a card that reloads the page is not the same card step 1 has");

  assert.match(app, /async function restoreBatchById\(id:string,requestedStep:string\|null,requestedPhase:string\|null,push=false\)/);
  assert.match(app, /await restoreBatchById\(existing,workflowStep,null,true\)/,
    "opening a card stays on the step you are on");

  /* The flush, and that it is awaited before the incoming batch takes over. */
  assert.match(app, /await persistBatchNow\(batchIdRef\.current\);[\s\S]{0,200}await restoreBatchById\(existing/,
    "the outgoing product must be saved before batchIdRef points somewhere else");
  assert.match(app, /async function persistBatchNow\(existingId\?:string\)/);
  assert.match(app, /void persistBatchNow\(\);\},700\);/,
    "the debounced autosave and the switch share one save");

  /* No second click while a load is in flight. */
  assert.match(app, /if\(switchingProduct\)return;\s*setSwitchingProduct\(recipe\.id\)/);
});

/* D392 · The saved-product form echoed the colours and sizes it was holding back
   to the server on every save — `defaultColorIds:existing?.defaultColorIds`.
   The form does not edit colours. If its copy of the recipe was stale, saving
   the product wrote the stale value over colours chosen since, which is exactly
   the loss D228 recorded: Gildan Tee with five saved colours in the morning and
   zero by the afternoon, while the other two products kept theirs.

   The API already preserves any key that is absent (see product-recipes route),
   so the fix is to stop sending what this form does not own. A form may only
   send the fields it edits. */
test("D392: the saved-product form never sends colours or sizes it does not edit", async () => {
  const tools = await read("app/factory-tools.tsx");
  const postBody = tools.slice(tools.indexOf('fetch("/api/product-recipes"'), tools.indexOf("const saved:Recipe="));
  assert.doesNotMatch(postBody, /defaultColorIds:existing\?\.defaultColorIds/,
    "echoing a held copy back is how a stale value overwrites a fresh one");
  assert.doesNotMatch(postBody, /defaultSizeIds:existing\?\.defaultSizeIds/);

  const route = await read("app/api/product-recipes/route.ts");
  assert.match(route, /if \(body\.defaultColorIds !== undefined\)/,
    "an absent key must leave the stored value alone");
  assert.match(route, /if \(body\.defaultSizeIds !== undefined\)/);
});

/* D394 · D393 made the Pricing row ask whenever the batch approval was missing,
   so a product fully set up in its own recipe still showed as unfinished. That
   is backwards - pricing saved on the recipe IS pricing set. The contradiction
   between a card of ticks and a gate that refuses is fixed at the gate: a recipe
   carrying a profit target and a shipping profile counts as approved without
   asking again. */
test("D394: a configured recipe does not have to re-approve its pricing", async () => {
  const readiness = await read("app/product-readiness.ts");

  assert.doesNotMatch(readiness, /note: "Approve prices and shipping"/,
    "a saved profit target reads as set, not as a question");
  assert.match(readiness, /export function recipeCarriesApprovedPricing/);
  assert.match(readiness, /Number\.isFinite\(target\) && target > 0 && Number\.isFinite\(profile\) && profile > 0/,
    "approved means the seller's own profit target and their own shipping profile");
});

/* D404 · "Set whole-number pricing, change the profit to twelve, refresh, it
   resets." The per-variant prices and the whole-number toggle lived only in
   React state and the batch snapshot — and that snapshot is not written until a
   batch has designs or drafts, so on the product step they were saved nowhere at
   all. They belong to the saved product, beside the profit target.

   The toggle was also component state, so it reset on every remount, and
   changeIndividualPrice never marked a hand edit, which let the recalculate
   effect snap a typed variant price back to the goal. */
test("D404: pricing set on the product step survives a refresh", async () => {
  const app = await read("app/listing-factory-app.tsx");
  const route = await read("app/api/product-recipes/route.ts");
  const tools = await read("app/factory-tools.tsx");

  assert.match(tools, /wholeNumberPricing\?:boolean;variantPrices\?:Record<string,number>;/,
    "the saved product carries them");
  assert.match(route, /if \(body\.wholeNumberPricing !== undefined\)/);
  assert.match(route, /if \(body\.variantPrices !== undefined\)/);
  assert.match(route, /wholeNumberPricing:saved\.wholeNumberPricing===true/, "and reads them back");

  assert.match(app, /function persistProductPricing\(recipe:Recipe\|null,change:Partial<Recipe>\)/);
  assert.match(app, /pricePersist\.current=window\.setTimeout\(\(\)=>\{void establish\(recipe,change\)\},700\)/,
    "debounced - a price field fires on every keystroke");
  assert.match(app, /persistProductPricing\(recipe,\{variantPrices:value\}\)/);
  assert.match(app, /persistProductPricing\(recipe,\{wholeNumberPricing:value\}\)/);
  assert.match(app, /setVariantPrices\(recipe\.variantPrices&&Object\.keys\(recipe\.variantPrices\)\.length/,
    "and they come back when the product is chosen");

  assert.match(app, /function changeIndividualPrice\(variant:ProductVariant,cents:number\)\{manualPriceEdit\.current=true;/,
    "a typed variant price must count as a hand edit or it gets recalculated away");
});

/* D406 · establish() POSTed the whole merged recipe, so every call resent every
   field from whatever copy its closure had captured — and any write that landed
   after a newer one put its stale copy back over the newer value. Measured on
   the live account: setting the profit goal to 12 left the product reading $1,
   because the debounced price write carried an older targetProfit and landed
   last. The API preserves any key that is absent, so send only what changed.
   Same rule as D392; establish is the more dangerous of the two because it fires
   on nearly every edit a seller makes. */
test("D406: establish sends only what changed", async () => {
  const app = await read("app/listing-factory-app.tsx");
  assert.match(app, /body:JSON\.stringify\(\{id:recipe\.id,name:recipe\.name,templateUrl:recipe\.templateUrl,\.\.\.change\}\)/,
    "a whole-recipe POST lets a stale closure overwrite newer values");
  /* Every recipe save had this shape, not just establish: seven call sites all
     POSTed a merged copy. None of them do now. */
  assert.doesNotMatch(app, /body:JSON\.stringify\(updated\)/,
    "posting the merged recipe is the bug, wherever it happens");
  assert.equal((app.match(/"\/api\/product-recipes",\{method:"POST"/g) || []).length,
    (app.match(/templateUrl:(recipe|activeRecipe|recipeForShop|refusedRecipe)\.templateUrl,/g) || []).length,
    "every recipe POST sends an explicit minimal payload");

  /* The local copy still updates so the card does not go stale on screen. */
  /* D463 · The merge is functional now - into whatever the recipe is at the
     moment the write lands, not the copy this closure captured - so a slow write
     cannot put a stale base back over a newer value. */
  assert.match(app, /setActiveRecipe\(current=>current&&current\.id===recipe\.id\?\{\.\.\.current,\.\.\.change\}:current\);/);
});

/* D420 · The profit goal was bound straight to the number, so clearing the field
   made Number("") = 0, Math.max(0,0) = 0, and React wrote "0" back into the box.
   Everything typed after that landed behind the zero — clear it, type 12, get
   "012". This is also why "12" sometimes came out as a different number. */
test("D420: the profit goal does not force a zero in front of what you type", async () => {
  const app = await read("app/listing-factory-app.tsx");
  assert.match(app, /const \[profitDraft,setProfitDraft\]=useState<string\|null>\(null\)/);
  assert.match(app, /value=\{profitDraft\?\?String\(pricing\.targetProfit\)\}/,
    "while focused the box holds exactly what was typed");
  assert.match(app, /if\(raw!==""&&Number\.isFinite\(parsed\)\)changeProfit\(parsed\)/,
    "an empty box must not commit 0");
  assert.match(app, /onBlur=\{\(\)=>setProfitDraft\(null\)\}/,
    "and the draft is dropped on blur so the real value shows again");
});

/* D419 · Publishing and draft creation are the two actions that spend real money
   and real quota, and neither confirm button had a disabled state — a double
   click fired both handlers before React could close the dialog, queueing two
   jobs. Duplicate live listings and two lots of Etsy's per-listing fee. */
test("D419: the actions that cost money cannot be fired twice", async () => {
  const app = await read("app/listing-factory-app.tsx");

  assert.match(app, /const publishInFlight=useRef\(false\);/);
  assert.match(app, /async function publishAll\(\)\{\s*if\(publishInFlight\.current\)return;/);
  assert.match(app, /<button className="danger" disabled=\{publishing\}/);

  assert.match(app, /const draftRunInFlight=useRef\(false\);/);
  assert.match(app, /if\(draftRunInFlight\.current\)return;/);
  assert.match(app, /<button className="preflight-confirm" disabled=\{running\}/);
});

/* D420/D422 · A number input bound straight to its number is a trap: clearing
   the box makes Number("") = 0, the fallback turns that into 0 or 1, React
   writes it back, and everything typed afterwards lands behind it — clear it,
   type 12, get "012". It bit the profit goal, both personalization limits, and
   all three Etsy fee fields, which is every price in the app.

   PriceField already had the answer: hold what was typed while the box has
   focus, commit only when it parses, drop the draft on blur. Every numeric input
   goes through that shape now. */
test("D422: no numeric input is bound straight to its number", async () => {
  const files = ["app/listing-factory-app.tsx", "app/usage/page.tsx"];
  const offenders = [];
  for (const file of files) {
    const source = await read(file);
    for (const match of source.matchAll(/<input[^>]*type="number"[^>]*>/g)) {
      const tag = match[0];
      /* A draft-managed field reads `value={draft??...}`; a raw one does not. */
      if (!/value=\{[a-zA-Z]*[Dd]raft\?\?/.test(tag)) offenders.push(`${file}: ${tag.slice(0, 90)}`);
    }
  }
  assert.deepEqual(offenders, [],
    `these will force a 0 in front of whatever is typed:\n${offenders.join("\n")}`);

  const app = await read("app/listing-factory-app.tsx");
  assert.match(app, /function IntegerField/);
  const usage = await read("app/usage/page.tsx");
  assert.match(usage, /function DecimalField/);
});
