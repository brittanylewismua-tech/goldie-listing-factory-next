import { test } from "node:test";
import assert from "node:assert/strict";
import { productReadiness } from "../app/product-readiness.ts";

/* Real shapes from the live account. Three saved products all reported
 * setupComplete: true while having defaultColorIds [], defaultSizeIds [] and
 * keywordListId "" — and all three had "BACH TEES", a t-shirt set, saved as
 * their default including the hoodie and the sweatshirt. */
const tee = {
  colorOptions: [
    { id: 1, title: "White", available: true, templateEnabled: true },
    { id: 2, title: "Black", available: true, templateEnabled: true },
    { id: 3, title: "Cocoa", available: true, templateEnabled: false },
  ],
  sizeOptions: [
    { id: 14, title: "S", available: true, templateEnabled: true },
    { id: 15, title: "M", available: true, templateEnabled: true },
    { id: 99, title: "5XL", available: true, templateEnabled: false },
  ],
  compatibleMockupThemes: ["BACH TEES"],
  keywordBanks: [{ id: "b1", name: "BACHELORETTE TEES" }],
  shippingProfiles: [{ id: 7, title: "Standard" }],
  templateShippingProfileId: 7,
  etsyFieldsRequired: 11,
  saved: {},
};

test("colors and sizes are always asked once, never taken from the template", () => {
  const result = productReadiness(tee);
  /* The Printify template is where you pick the blueprint, the print provider and
   * the artwork placement — not colors and sizes. Whatever variants are enabled
   * there are Printify's defaults, so inheriting them would publish listings in
   * colors the seller never chose. They are asked once, per product. */
  /* Only one keyword bank exists in this fixture, so that one is not a question. */
  assert.deepEqual(result.questions, ["colors", "sizes"]);
  assert.equal(result.autoResolved.keywordListId, "b1");
  assert.equal(result.established, false);
  assert.equal(result.autoResolved.colorIds, undefined);
  assert.equal(result.autoResolved.sizeIds, undefined);

  /* The template's enabled variants still open the picker pre-selected — a
   * starting point, not an answer. */
  const colors = result.facets.find((f) => f.name === "colors");
  assert.deepEqual(colors.suggested.colorIds, [1, 2]);
  const sizes = result.facets.find((f) => f.name === "sizes");
  assert.deepEqual(sizes.suggested.sizeIds, [14, 15]);

  /* One compatible mockup set is genuinely not a choice. */
  assert.equal(result.autoResolved.mockupTheme, "BACH TEES");
});

test("a saved mockup set that does not fit the product is not readiness", () => {
  /* The hoodie case: BACH TEES saved, but no tee set is compatible with a hoodie,
   * so compatibleMockupThemes is empty. Presence said ready; the product was
   * unusable and the mockup card rendered blank. */
  const hoodie = { ...tee, compatibleMockupThemes: [], saved: { defaultMockupTheme: "BACH TEES", defaultColorIds: [1], defaultSizeIds: [14], keywordListId: "b1" } };
  const mockups = productReadiness(hoodie).facets.find((f) => f.name === "mockups");
  assert.equal(mockups.label, "No mockups");
  assert.match(mockups.note, /BACH TEES does not fit this product/);
  /* Having no compatible set is a fact, not a blocker — you can publish without
   * lifestyle mockups. */
  assert.equal(mockups.state, "auto");
  assert.equal(productReadiness(hoodie).established, true);
});

test("an established product asks nothing at all", () => {
  /* This is the state a product reaches after its first batch: every choice is
   * saved on the recipe, so a later batch shows a summary and no controls. */
  const established = { ...tee, saved: { defaultColorIds: [1, 2], defaultSizeIds: [14, 15], keywordListId: "b1", defaultMockupTheme: "BACH TEES" } };
  const result = productReadiness(established);
  assert.deepEqual(result.questions, []);
  assert.equal(result.established, true);
  assert.deepEqual(result.facets.filter(f=>["colors","sizes","mockups","keywords"].includes(f.name)).map((f) => f.state), ["ready", "ready", "ready", "ready"]);
});

test("saved choices win over template defaults", () => {
  const configured = { ...tee, saved: { defaultColorIds: [3], defaultSizeIds: [99], keywordListId: "b1", defaultMockupTheme: "BACH TEES" } };
  const result = productReadiness(configured);
  assert.equal(result.established, true);
  assert.deepEqual(result.facets.filter(f=>["colors","sizes","mockups","keywords"].includes(f.name)).map((f) => f.state), ["ready", "ready", "ready", "ready"]);
  assert.equal(result.facets.find((f) => f.name === "colors").label, "1 color");
});

test("saved values that are no longer available reopen the question", () => {
  /* A colour removed from the Printify product must not keep a product "ready"
   * against a variant that cannot be ordered — and must not silently swap in a
   * different colour either. It gets asked again. */
  const stale = { ...tee, saved: { defaultColorIds: [404], defaultSizeIds: [404] } };
  const result = productReadiness(stale);
  assert.equal(result.facets.find((f) => f.name === "colors").state, "ask");
  assert.equal(result.facets.find((f) => f.name === "sizes").state, "ask");
  assert.equal(result.autoResolved.colorIds, undefined);
});

test("a product with no size axis is not asked about sizes", () => {
  const mug = { ...tee, sizeOptions: [], saved: { defaultColorIds: [1] } };
  const sizes = productReadiness(mug).facets.find((f) => f.name === "sizes");
  assert.equal(sizes.state, "ready");
  assert.equal(sizes.label, "One size");
});

test("no keyword banks at all is a real question", () => {
  const noBanks = { ...tee, keywordBanks: [], saved: { defaultColorIds: [1], defaultSizeIds: [14] } };
  const result = productReadiness(noBanks);
  assert.deepEqual(result.questions, ["keywords"]);
  assert.match(result.facets.find((f) => f.name === "keywords").note, /Create a keyword bank first/);
});

test("declining mockups is a real answer, not a gap", () => {
  const declined = { ...tee, compatibleMockupThemes: ["A", "B"], saved: { mockupsDeclined: true, defaultColorIds: [1], defaultSizeIds: [14], keywordListId: "b1" } };
  const mockups = productReadiness(declined).facets.find((f) => f.name === "mockups");
  assert.equal(mockups.state, "ready");
  assert.equal(mockups.label, "No mockups");
});

test("shipping copies the profile Printify already attached — D183", () => {
  /* Publishing the product to Etsy once is a required setup step, so a profile is
   * already attached. Asking the seller to pick it again is asking a question that
   * has an answer. */
  const shipping = productReadiness(tee).facets.find((f) => f.name === "shipping");
  assert.equal(shipping.state, "auto");
  assert.equal(shipping.label, "Standard");
  assert.equal(shipping.resolved.shippingProfileId, 7);
});

test("shipping is only a question when the answer is genuinely unknown", () => {
  const many = { ...tee, templateShippingProfileId: 0, shippingProfiles: [{ id: 1, title: "A" }, { id: 2, title: "B" }] };
  assert.equal(productReadiness(many).facets.find((f) => f.name === "shipping").state, "ask");
  const none = { ...tee, templateShippingProfileId: 0, shippingProfiles: [] };
  assert.match(productReadiness(none).facets.find((f) => f.name === "shipping").note, /No Etsy shipping profiles/);
});

test("profit and Etsy attributes never block a batch", () => {
  /* Both have workable defaults: $10, and Etsy's own attribute defaults. They are
   * shown so the seller can change them, not to stop the batch. */
  const result = productReadiness(tee);
  const profit = result.facets.find((f) => f.name === "profit");
  const etsy = result.facets.find((f) => f.name === "etsy");
  assert.equal(profit.state, "auto");
  assert.equal(profit.label, "$10 per item");
  assert.equal(etsy.state, "auto");
  assert.equal(etsy.label, "0 of 11 set");
  assert.ok(!result.questions.includes("profit"));
  assert.ok(!result.questions.includes("etsy"));
});

test("a saved profit goal and Etsy attributes read as settled", () => {
  const configured = { ...tee, saved: { defaultProfitTarget: 25, etsyDefaults: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`f${i}`, "x"])) } };
  const result = productReadiness(configured);
  assert.equal(result.facets.find((f) => f.name === "profit").label, "$25 per item");
  assert.equal(result.facets.find((f) => f.name === "etsy").state, "ready");
});
