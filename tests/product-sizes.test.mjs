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
