import { test } from "node:test";
import assert from "node:assert/strict";
import { productReadiness, mockupFacet, keywordFacet, etsyFacet, shippingFacet, profitFacet } from "../app/product-readiness.ts";

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
  /* D221 · Product readiness is product setup only. The keyword bank moved to the
     Listing page and the mockup set to the Images page, so neither appears here. */
  assert.deepEqual(result.questions, ["colors", "sizes"]);
  /* D223 · Colours and sizes only. The pricing panel below the card owns the
     profit goal and the shipping profile — the per-variant prices are computed
     from them — so keeping them on the card put two controls for one value on
     one screen. */
  assert.deepEqual(result.facets.map((f) => f.name), ["colors", "sizes"]);
  assert.equal(result.established, false);
  assert.equal(result.autoResolved.colorIds, undefined);
  assert.equal(result.autoResolved.sizeIds, undefined);

  /* The template's enabled variants still open the picker pre-selected — a
   * starting point, not an answer. */
  const colors = result.facets.find((f) => f.name === "colors");
  assert.deepEqual(colors.suggested.colorIds, [1, 2]);
  const sizes = result.facets.find((f) => f.name === "sizes");
  assert.deepEqual(sizes.suggested.sizeIds, [14, 15]);

  /* The mockup rule is unchanged, it just belongs to the Images page now: one
     compatible set is genuinely not a choice. */
  assert.equal(mockupFacet(tee).resolved.mockupTheme, "BACH TEES");
  /* And the single keyword bank still resolves itself, on the Listing page. */
  assert.equal(keywordFacet(tee).resolved.keywordListId, "b1");
});

test("a saved mockup set that does not fit the product is not readiness", () => {
  /* The hoodie case: BACH TEES saved, but no tee set is compatible with a hoodie,
   * so compatibleMockupThemes is empty. Presence said ready; the product was
   * unusable and the mockup card rendered blank. */
  const hoodie = { ...tee, compatibleMockupThemes: [], saved: { defaultMockupTheme: "BACH TEES", defaultColorIds: [1], defaultSizeIds: [14], keywordListId: "b1" } };
  /* D221 · The mockup rule now lives with the photos on the Images page, so it is
     checked directly rather than through product readiness. */
  const mockups = mockupFacet(hoodie);
  assert.equal(mockups.label, "No mockups");
  assert.match(mockups.note, /BACH TEES does not fit this product/);
  /* Having no compatible set is a fact, not a blocker — you can publish without
   * lifestyle mockups. */
  assert.equal(mockups.state, "auto");
  assert.equal(productReadiness(hoodie).established, true, "and it never blocked product setup");
});

test("an established product asks nothing at all", () => {
  /* This is the state a product reaches after its first batch: every choice is
   * saved on the recipe, so a later batch shows a summary and no controls. */
  const established = { ...tee, saved: { defaultColorIds: [1, 2], defaultSizeIds: [14, 15], keywordListId: "b1", defaultMockupTheme: "BACH TEES" } };
  const result = productReadiness(established);
  assert.deepEqual(result.questions, []);
  assert.equal(result.established, true);
  /* colours and sizes are the seller's, saved on the recipe; shipping copies the
     profile Printify attached and profit falls back to $10 — both editable, both
     "auto" rather than a question. */
  assert.deepEqual(result.facets.map((f) => f.state), ["ready", "ready"]);
  /* The choices that moved are still settled on their own pages. */
  assert.equal(mockupFacet(established).state, "ready");
  assert.equal(keywordFacet(established).state, "ready");
});

test("saved choices win over template defaults", () => {
  const configured = { ...tee, saved: { defaultColorIds: [3], defaultSizeIds: [99], keywordListId: "b1", defaultMockupTheme: "BACH TEES" } };
  const result = productReadiness(configured);
  assert.equal(result.established, true);
  /* colours and sizes are the seller's, saved on the recipe; shipping copies the
     profile Printify attached and profit falls back to $10 — both editable, both
     "auto" rather than a question. */
  assert.deepEqual(result.facets.map((f) => f.state), ["ready", "ready"]);
  assert.equal(mockupFacet(configured).state, "ready");
  assert.equal(keywordFacet(configured).state, "ready");
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
  /* D221 · Asked on the Listing page now, where the titles that consume the bank
     are built — not as a condition of finishing product setup. */
  const keywords = keywordFacet(noBanks);
  assert.equal(keywords.state, "ask");
  assert.match(keywords.note, /Create a keyword bank first/);
  assert.ok(!productReadiness(noBanks).questions.includes("keywords"),
    "a missing bank must not block the Product page");
});

test("declining mockups is a real answer, not a gap", () => {
  const declined = { ...tee, compatibleMockupThemes: ["A", "B"], saved: { mockupsDeclined: true, defaultColorIds: [1], defaultSizeIds: [14], keywordListId: "b1" } };
  const mockups = mockupFacet(declined);
  assert.equal(mockups.state, "ready");
  assert.equal(mockups.label, "No mockups");
});

test("shipping copies the profile Printify already attached — D183", () => {
  /* Publishing the product to Etsy once is a required setup step, so a profile is
   * already attached. Asking the seller to pick it again is asking a question that
   * has an answer. */
  /* D223 · Shipping lives in the pricing panel now, so it is checked directly.
     The rule is unchanged. */
  const shipping = shippingFacet(tee);
  assert.equal(shipping.state, "auto");
  assert.equal(shipping.label, "Standard");
  assert.equal(shipping.resolved.shippingProfileId, 7);
});

test("shipping is only a question when the answer is genuinely unknown", () => {
  const many = { ...tee, templateShippingProfileId: 0, shippingProfiles: [{ id: 1, title: "A" }, { id: 2, title: "B" }] };
  assert.equal(shippingFacet(many).state, "ask");
  const none = { ...tee, templateShippingProfileId: 0, shippingProfiles: [] };
  assert.match(shippingFacet(none).note, /No Etsy shipping profiles/);
});

test("profit and Etsy attributes never block a batch", () => {
  /* Both have workable defaults: $10, and Etsy's own attribute defaults. They are
   * shown so the seller can change them, not to stop the batch. */
  const result = productReadiness(tee);
  const profit = profitFacet(tee);
  assert.equal(profit.state, "auto");
  assert.equal(profit.label, "$10 per item");
  assert.ok(!result.questions.includes("profit"));
  /* Etsy attributes moved to the Listing page; they still never block. */
  const etsy = etsyFacet(tee);
  assert.equal(etsy.state, "auto");
  assert.equal(etsy.label, "0 of 11 set");
  assert.ok(!result.facets.some((f) => f.name === "etsy"));
});

test("a saved profit goal and Etsy attributes read as settled", () => {
  const configured = { ...tee, saved: { defaultProfitTarget: 25, etsyDefaults: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`f${i}`, "x"])) } };
  const result = productReadiness(configured);
  assert.equal(profitFacet(configured).label, "$25 per item");
  assert.equal(etsyFacet(configured).state, "ready");
});

/* Shared base so these fixtures carry every required input; only the axis under
   test varies. */
const base = { compatibleMockupThemes: [], keywordBanks: [], shippingProfiles: [{ id: 7, title: "Standard" }], templateShippingProfileId: 7, etsyFieldsRequired: 0 };

test("D201: a counted facet names its values and never drops any silently", () => {
  const colorOptions = [
    { id: 1, title: "White", available: true, templateEnabled: true },
    { id: 2, title: "Sport Grey", available: true, templateEnabled: true },
    { id: 3, title: "Daisy", available: true, templateEnabled: true },
    { id: 4, title: "Heather Sport Dark Navy", available: true, templateEnabled: true },
    { id: 5, title: "Irish Green", available: true, templateEnabled: true },
  ];
  const sizeOptions = ["S", "M", "L", "XL", "2XL"].map((title, i) => ({ id: 10 + i, title, available: true, templateEnabled: true }));

  const readiness = productReadiness({
    ...base, colorOptions, sizeOptions,
    saved: { defaultColorIds: [1, 2, 3, 4, 5], defaultSizeIds: [10, 11, 12, 13, 14] },
  });

  const colors = readiness.facets.find((f) => f.name === "colors");
  assert.equal(colors.label, "5 colors");
  assert.equal(colors.note, "White, Sport Grey, Daisy +2 more",
    "the row said '5 colors' over a list of three, with no sign two were hidden");

  const sizes = readiness.facets.find((f) => f.name === "sizes");
  assert.equal(sizes.label, "5 sizes");
  assert.equal(sizes.note, "S, M, L, XL, 2XL", "sizes named nothing at all before");
});

test("D201: a facet at or under its limit lists everything with no suffix", () => {
  const colorOptions = [
    { id: 1, title: "White", available: true, templateEnabled: true },
    { id: 2, title: "Black", available: true, templateEnabled: true },
  ];
  const readiness = productReadiness({ ...base, colorOptions, sizeOptions: [], saved: { defaultColorIds: [1, 2] } });
  const colors = readiness.facets.find((f) => f.name === "colors");
  assert.equal(colors.note, "White, Black");
  assert.doesNotMatch(colors.note, /more/);
});

test("D201: sizes disclose a remainder too once past their limit", () => {
  const sizeOptions = ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"]
    .map((title, i) => ({ id: 10 + i, title, available: true, templateEnabled: true }));
  const readiness = productReadiness({ ...base, colorOptions: [], sizeOptions, saved: { defaultSizeIds: sizeOptions.map((s) => s.id) } });
  const sizes = readiness.facets.find((f) => f.name === "sizes");
  assert.equal(sizes.label, "8 sizes");
  assert.equal(sizes.note, "S, M, L, XL, 2XL, 3XL +2 more");
});
