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

test("size seeding uses the same four-step precedence as colour", async () => {
  const app = await read("app/listing-factory-app.tsx");
  /* saved product default -> this browser's last choice -> what the template had
   * enabled -> every available size. Step three is what makes an EXISTING product
   * behave exactly as it did before sizes were selectable. */
  assert.match(app, /const rememberedSizes=rememberedSizeIds\.filter\(id=>sizeAvailable\.has\(id\)\)/);
  assert.match(app, /const sizeDefaults=rememberedSizes\.length\?rememberedSizes:sessionSizeIds\.length\?sessionSizeIds:\(result\.product\.sizeOptions\|\|\[\]\)\.filter\(size=>size\.available&&size\.templateEnabled\)\.map\(size=>size\.id\)/);
  assert.match(app, /setSelectedSizeIds\(sizeDefaults\.length\?sizeDefaults:\[\.\.\.sizeAvailable\]\)/,
    "The final fallback must be every available size, so the selection is never empty.");
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

test("no size action can leave the seller with nothing selected — D164", async () => {
  const app = await read("app/listing-factory-app.tsx");
  /* "Match Printify template" selects the template's enabled sizes. If those
   * happened to be unavailable it would select nothing and then block Continue,
   * with no hint as to why. It falls back to every available size instead. */
  assert.match(app, /onChange\(templateSizes\.length\?templateSizes:available\.map\(size=>size\.id\)\)/);
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
  assert.match(globals, /\.saved-product-batch-page \.product-size-selector\{width:100%;margin:0;border:0;box-shadow:none;background:transparent;padding:0\}/);
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
  assert.match(app, /className=\{`batch-product-card \$\{ready\.established\?"is-ready":"needs-setup"\}`\}/,
    "The card has two states, driven by computed readiness.");
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
  for (const facet of ["colors", "sizes", "mockups", "keywords"])
    assert.match(app, new RegExp(`open==="${facet}"&&`), `${facet} must open from the card`);
  assert.doesNotMatch(app, /className="saved-settings-summary"/,
    "The summary chips duplicated the card's chips.");
  assert.doesNotMatch(app, /className="keyword-bank-required"/,
    "The keyword prompt was a third place saying what the chip says.");

  /* Choosing something in a batch IS establishing the product, so it persists
   * immediately rather than behind a separate save-as-default button. */
  assert.match(app, /async function establish\(recipe:Recipe,change:Partial<Recipe>\)/);
  assert.match(app, /establish\(recipe,\{defaultColorIds:ids\}\)/);
  assert.match(app, /void establish\(recipe,\{keywordListId:id\}\)/);
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
  assert.match(app, /if\(bundleKeywordGaps\.length\)issues\.push\(`Choose a keyword bank for \$\{bundleKeywordGaps\.join\(", "\)\}\.`\)/,
    "The step gate must name the products still missing a bank.");
  assert.match(app, /\|\|bundleKeywordGaps\.length>0\|\|/,
    "Continue stays disabled until every product has one.");
  assert.match(app, /bundleKeywordGaps\.length\?`Pick a keyword bank for \$\{bundleKeywordGaps\.join\(", "\)\}`/,
    "And it says which products, not just that something is missing.");
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

  /* Every chip does something. Colours, sizes, mockups and keywords open in the
   * card; shipping, profit and Etsy details open the product-settings block and
   * scroll to it. A chip for a product that is not the current one in a bundle
   * stays a fact rather than a control that cannot work. */
  assert.match(app, /const inCard=\["colors","sizes","mockups","keywords"\]\.includes\(facet\.name\);/);
  assert.match(app, /const block=document\.querySelector<HTMLDetailsElement>\("\.everything-else"\);/);
  assert.match(app, /block\.open=true;block\.scrollIntoView\(\{block:"start"\}\)/,
    "Opening a setting must bring it into view — the same failure as Edit bundle.");
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
  assert.doesNotMatch(app, /onRemember=\{\(\)=>\{\}\} remembering=\{false\} remembered\/>/,
    "The card's pickers must open expanded.");
  assert.equal((app.match(/onRemember=\{\(\)=>\{\}\} remembering=\{false\} remembered=\{false\}\/>/g) || []).length, 2);
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
  assert.match(app, /Use Printify&rsquo;s \{suggestion\}/);
  assert.match(app, /className="batch-product-rows"/);
  assert.match(clarity, /\.app-shell \.batch-product-rows\{/);
});

test("the product photo is visible against the card — D188", async () => {
  const clarity = await read("app/clarity-pass.css");
  /* The blueprint catalog image is a blank garment on white. Measured: the image
   * loaded at 2048px and rendered as an empty square, because a white tee on the
   * card's plum gradient at 52px is invisible. */
  assert.match(clarity, /\.app-shell \.bundle-product-photo\{[^}]*background:#fff!important/);
  assert.match(clarity, /\.app-shell \.bundle-product-photo\{[^}]*object-fit:contain!important/);
});
