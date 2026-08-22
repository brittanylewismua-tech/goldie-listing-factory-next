import { test } from "node:test";
import assert from "node:assert/strict";
import { productReadiness } from "../app/product-readiness.ts";

/* Real shapes from the live account. Three saved products all reported
 * setupComplete: true while having defaultColorIds [], defaultSizeIds [] and
 * keywordListId "" — and all three had "BACH TEES", a t-shirt set, saved as
 * their default including the hoodie and the sweatshirt. */
const tee = {
  colourOptions: [
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
  saved: {},
};

test("an unconfigured product asks nothing it can answer itself", () => {
  const result = productReadiness(tee);
  /* Colours and sizes come from the Printify template. One compatible mockup set
   * and one keyword bank are not choices. So a brand-new product with this data
   * is established without asking the seller anything. */
  assert.deepEqual(result.questions, []);
  assert.equal(result.established, true);
  assert.deepEqual(result.autoResolved.colourIds, [1, 2]);
  assert.deepEqual(result.autoResolved.sizeIds, [14, 15]);
  assert.equal(result.autoResolved.mockupTheme, "BACH TEES");
  assert.equal(result.autoResolved.keywordListId, "b1");
});

test("a saved mockup set that does not fit the product is not readiness", () => {
  /* The hoodie case: BACH TEES saved, but no tee set is compatible with a hoodie,
   * so compatibleMockupThemes is empty. Presence said ready; the product was
   * unusable and the mockup card rendered blank. */
  const hoodie = { ...tee, compatibleMockupThemes: [], saved: { defaultMockupTheme: "BACH TEES" } };
  const mockups = productReadiness(hoodie).facets.find((f) => f.name === "mockups");
  assert.equal(mockups.label, "No mockups");
  assert.match(mockups.note, /BACH TEES does not fit this product/);
  /* Having no compatible set is a fact, not a blocker — you can publish without
   * lifestyle mockups. */
  assert.equal(mockups.state, "auto");
  assert.equal(productReadiness(hoodie).established, true);
});

test("only genuinely ambiguous facets become questions", () => {
  const ambiguous = {
    ...tee,
    compatibleMockupThemes: ["BACH TEES", "PALM SPRINGS"],
    keywordBanks: [{ id: "b1", name: "BACHELORETTE TEES" }, { id: "b2", name: "JANE AUSTEN TEE" }],
  };
  const result = productReadiness(ambiguous);
  assert.deepEqual(result.questions, ["mockups", "keywords"]);
  assert.equal(result.established, false);
  /* Colours and sizes still resolve themselves — two open questions, not four. */
  assert.deepEqual(result.autoResolved.colourIds, [1, 2]);
  assert.deepEqual(result.autoResolved.sizeIds, [14, 15]);
});

test("saved choices win over template defaults", () => {
  const configured = { ...tee, saved: { defaultColorIds: [3], defaultSizeIds: [99], keywordListId: "b1", defaultMockupTheme: "BACH TEES" } };
  const result = productReadiness(configured);
  assert.equal(result.established, true);
  assert.deepEqual(result.facets.map((f) => f.state), ["ready", "ready", "ready", "ready"]);
  assert.equal(result.facets.find((f) => f.name === "colours").label, "1 colour");
});

test("saved values that are no longer available fall back rather than sticking", () => {
  /* A colour removed from the Printify product must not keep a product "ready"
   * against a variant that cannot be ordered. */
  const stale = { ...tee, saved: { defaultColorIds: [404], defaultSizeIds: [404] } };
  const result = productReadiness(stale);
  assert.equal(result.facets.find((f) => f.name === "colours").state, "auto");
  assert.deepEqual(result.autoResolved.colourIds, [1, 2]);
  assert.deepEqual(result.autoResolved.sizeIds, [14, 15]);
});

test("a product with no size axis is not asked about sizes", () => {
  const mug = { ...tee, sizeOptions: [] };
  const sizes = productReadiness(mug).facets.find((f) => f.name === "sizes");
  assert.equal(sizes.state, "ready");
  assert.equal(sizes.label, "One size");
});

test("no keyword banks at all is a real question", () => {
  const noBanks = { ...tee, keywordBanks: [] };
  const result = productReadiness(noBanks);
  assert.deepEqual(result.questions, ["keywords"]);
  assert.match(result.facets.find((f) => f.name === "keywords").note, /Create a keyword bank first/);
});

test("declining mockups is a real answer, not a gap", () => {
  const declined = { ...tee, compatibleMockupThemes: ["A", "B"], saved: { mockupsDeclined: true } };
  const mockups = productReadiness(declined).facets.find((f) => f.name === "mockups");
  assert.equal(mockups.state, "ready");
  assert.equal(mockups.label, "No mockups");
});
