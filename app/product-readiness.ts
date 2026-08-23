/* Readiness for one product in a batch.
 *
 * WHERE CHOICES LIVE. The Printify template is not where a seller picks colors
 * and sizes. The three things the app tells them to do there are: choose the
 * product and print provider, set the artwork placement, and publish once to Etsy
 * so a shipping profile exists. Whatever variants are enabled on that product are
 * therefore incidental — Printify's defaults, or the minimum needed to publish.
 * Treating them as the seller's intent would put listings live in colors they
 * never chose, so `templateEnabled` only ever SUGGESTS a starting selection; it
 * can never mark a product ready.
 *
 * Colors and sizes are chosen in the Listing Factory, once per product. The
 * wizard is not "ask nothing" — it is "ask once, then never again".
 *
 * Two things this exists to fix.
 *
 * 1. `setupComplete` on the recipe is not trustworthy. The API reads it as
 *    `saved.setupComplete !== false`, so it is true for every recipe that never
 *    explicitly stored false — including recipes with no colors, no sizes and no
 *    keyword bank. Measured on the live account: three saved products, all
 *    reporting setupComplete true, all with defaultColorIds [], defaultSizeIds []
 *    and keywordListId "". Readiness has to be computed from the data.
 *
 * 2. Presence is not readiness. All three of those products had
 *    defaultMockupTheme "BACH TEES" — a t-shirt set — saved against a hoodie and a
 *    sweatshirt. A presence check calls that ready; the product is unusable, which
 *    is why the hoodie's mockup card rendered empty. Compatibility is part of it.
 *
 * The wizard rule: a facet with exactly one valid answer is not a question. It
 * resolves itself and reports "auto", so the UI shows a settled fact instead of a
 * control. Only genuinely ambiguous facets are asked. */

export type ReadinessState = "ready" | "auto" | "ask";
export type FacetName = "colors" | "sizes" | "mockups" | "keywords" | "shipping" | "profit" | "etsy";

export type Facet = {
  name: FacetName;
  state: ReadinessState;
  label: string;
  resolved?: { colorIds?: number[]; sizeIds?: number[]; mockupTheme?: string; mockupIds?: string[]; keywordListId?: string; shippingProfileId?: number; profitTarget?: number };
  /* A starting selection for a facet that must still be confirmed. Never treated
   * as an answer. */
  suggested?: { colorIds?: number[]; sizeIds?: number[] };
  note?: string;
};

export type ReadinessInput = {
  colorOptions: Array<{ id: number; title: string; available: boolean; templateEnabled: boolean }>;
  sizeOptions: Array<{ id: number; title: string; available: boolean; templateEnabled: boolean }>;
  compatibleMockupThemes: string[];
  keywordBanks: Array<{ id: string; name: string }>;
  /* Etsy shipping profiles available on the connected shop. */
  shippingProfiles: Array<{ id: number; title: string }>;
  /* The shipping profile Printify already has attached to this product, if any. */
  templateShippingProfileId?: number;
  /* Etsy attributes this blueprint requires, and how many the recipe has set. */
  etsyFieldsRequired: number;
  saved: {
    defaultColorIds?: number[];
    defaultSizeIds?: number[];
    defaultMockupTheme?: string;
    mockupIds?: string[];
    keywordListId?: string;
    mockupsDeclined?: boolean;
    etsyShippingProfileId?: number;
    defaultProfitTarget?: number;
    etsyDefaults?: Record<string, unknown>;
  };
};

export type Readiness = {
  facets: Facet[];
  established: boolean;
  questions: FacetName[];
  autoResolved: NonNullable<Facet["resolved"]>;
};

/* D201 · A ready facet listed the first three names and silently dropped the
 * rest, so the Colors row read "5 colors" above "White, Sport Grey, Daisy" —
 * the label and the list disagreed on the same row, and there was no way to
 * tell whether the other two were missing or simply not shown. Sizes named
 * nothing at all, so two facets the seller picks the same way were reported
 * differently. Always disclose the remainder, and never leave a counted facet
 * unnamed.
 *
 * The limits differ because the names do: colour names run long ("Heather
 * Sport Dark Navy"), size names are one to three characters. */
function nameList(names: string[], limit: number): string {
  if (!names.length) return "";
  if (names.length <= limit) return names.join(", ");
  return `${names.slice(0, limit).join(", ")} +${names.length - limit} more`;
}

function colorFacet(input: ReadinessInput): Facet {
  const available = input.colorOptions.filter((color) => color.available);
  const saved = (input.saved.defaultColorIds || []).filter((id) => available.some((color) => color.id === id));
  if (saved.length) {
    const names = saved.map((id) => available.find((color) => color.id === id)?.title).filter(Boolean) as string[];
    return { name: "colors", state: "ready", label: `${saved.length} ${saved.length === 1 ? "color" : "colors"}`, note: nameList(names, 3) };
  }
  if (!available.length) return { name: "colors", state: "ready", label: "No color choices" };
  /* Never auto-resolve. The template's enabled colors are Printify's doing, not
   * the seller's, so they open the picker pre-selected and wait for confirmation. */
  const suggested = available.filter((color) => color.templateEnabled).map((color) => color.id);
  return {
    name: "colors",
    state: "ask",
    label: "",
    suggested: { colorIds: suggested.length ? suggested : available.map((color) => color.id) },
    note: `${available.length} available`,
  };
}

function sizeFacet(input: ReadinessInput): Facet {
  if (!input.sizeOptions.length) return { name: "sizes", state: "ready", label: "One size" };
  const available = input.sizeOptions.filter((size) => size.available);
  const saved = (input.saved.defaultSizeIds || []).filter((id) => available.some((size) => size.id === id));
  if (saved.length) {
    const names = saved.map((id) => available.find((size) => size.id === id)?.title).filter(Boolean) as string[];
    return { name: "sizes", state: "ready", label: `${saved.length} ${saved.length === 1 ? "size" : "sizes"}`, note: nameList(names, 6) };
  }
  if (!available.length) return { name: "sizes", state: "ready", label: "One size" };
  const suggested = available.filter((size) => size.templateEnabled).map((size) => size.id);
  return {
    name: "sizes",
    state: "ask",
    label: "",
    suggested: { sizeIds: suggested.length ? suggested : available.map((size) => size.id) },
    note: `${available.length} available`,
  };
}

export function mockupFacet(input: ReadinessInput): Facet {
  const compatible = input.compatibleMockupThemes;
  const savedTheme = (input.saved.defaultMockupTheme || "").trim();
  /* A saved set this blueprint cannot use is worse than none: it reads as
   * configured and produces an empty mockup card. */
  if (savedTheme && compatible.includes(savedTheme)) {
    return { name: "mockups", state: "ready", label: savedTheme, resolved: { mockupTheme: savedTheme, mockupIds: input.saved.mockupIds || [] } };
  }
  if (input.saved.mockupsDeclined) return { name: "mockups", state: "ready", label: "No mockups" };
  if (!compatible.length) {
    return {
      name: "mockups",
      state: "auto",
      label: "No mockups",
      resolved: { mockupTheme: "", mockupIds: [] },
      note: savedTheme ? `${savedTheme} does not fit this product` : "No sets in your library fit this product",
    };
  }
  if (compatible.length === 1) return { name: "mockups", state: "auto", label: compatible[0], resolved: { mockupTheme: compatible[0], mockupIds: [] } };
  return { name: "mockups", state: "ask", label: "", note: `${compatible.length} sets fit this product` };
}

export function keywordFacet(input: ReadinessInput): Facet {
  const banks = input.keywordBanks;
  const savedId = (input.saved.keywordListId || "").trim();
  const saved = banks.find((bank) => bank.id === savedId);
  if (saved) return { name: "keywords", state: "ready", label: saved.name };
  if (banks.length === 1) return { name: "keywords", state: "auto", label: banks[0].name, resolved: { keywordListId: banks[0].id } };
  if (!banks.length) return { name: "keywords", state: "ask", label: "", note: "Create a keyword bank first" };
  return { name: "keywords", state: "ask", label: "", note: `${banks.length} banks to choose from` };
}

export function shippingFacet(input: ReadinessInput): Facet {
  const saved = Number(input.saved.etsyShippingProfileId) || 0;
  const match = input.shippingProfiles.find((profile) => profile.id === saved);
  if (match) return { name: "shipping", state: "ready", label: match.title };
  /* Printify already published this product to Etsy with a profile attached.
   * Copying it is not a decision the seller needs to make again. */
  const fromTemplate = input.shippingProfiles.find((profile) => profile.id === Number(input.templateShippingProfileId || 0));
  if (fromTemplate) return { name: "shipping", state: "auto", label: fromTemplate.title, resolved: { shippingProfileId: fromTemplate.id } };
  if (input.shippingProfiles.length === 1) return { name: "shipping", state: "auto", label: input.shippingProfiles[0].title, resolved: { shippingProfileId: input.shippingProfiles[0].id } };
  if (!input.shippingProfiles.length) return { name: "shipping", state: "ask", label: "", note: "No Etsy shipping profiles found" };
  return { name: "shipping", state: "ask", label: "", note: `${input.shippingProfiles.length} profiles on your shop` };
}

export function profitFacet(input: ReadinessInput): Facet {
  const saved = Number(input.saved.defaultProfitTarget);
  if (Number.isFinite(saved) && saved > 0) return { name: "profit", state: "ready", label: `$${saved.toFixed(0)} per item` };
  /* A profit goal always has a workable default, so it is never a blocker. */
  return { name: "profit", state: "auto", label: "$10 per item", resolved: { profitTarget: 10 } };
}

export function etsyFacet(input: ReadinessInput): Facet {
  const set = Object.keys(input.saved.etsyDefaults || {}).length;
  const required = input.etsyFieldsRequired;
  if (!required) return { name: "etsy", state: "ready", label: "Nothing required" };
  if (set >= required) return { name: "etsy", state: "ready", label: `${set} of ${required} set` };
  /* Etsy attributes are optional to publish — a gap is worth showing, not blocking. */
  return { name: "etsy", state: "auto", label: `${set} of ${required} set`, note: set ? "" : "Etsy will use its own defaults" };
}

export function productReadiness(input: ReadinessInput): Readiness {
  /* D221 · The product card carries product setup and nothing else: colours,
   * sizes, pricing and shipping. Mockups belong with the photos on the Images
   * page, the keyword bank belongs with the titles that use it on the Listing
   * page, and Etsy details belong beside those titles too. Having them here
   * meant the same choice appeared in two places and the Product page blocked
   * Continue on a decision that is made two pages later.
   *
   * mockupFacet, keywordFacet and etsyFacet are kept and still exported through
   * the type — the pages that own those choices use the same compatibility and
   * completeness rules — they are simply no longer part of product readiness. */
  /* D223 · Colours and sizes only. The pricing panel directly below the card owns
   * the profit goal and the Etsy shipping profile — it has to, because the
   * per-variant prices are computed from them — so carrying them on the card too
   * put two controls for one value on the same screen. That is the split
   * Brittany described: pick the colours and sizes, then price them underneath. */
  const facets = [colorFacet(input), sizeFacet(input)];
  const autoResolved: NonNullable<Facet["resolved"]> = {};
  for (const facet of facets) if (facet.state === "auto" && facet.resolved) Object.assign(autoResolved, facet.resolved);
  const questions = facets.filter((facet) => facet.state === "ask").map((facet) => facet.name);
  return { facets, established: questions.length === 0, questions, autoResolved };
}
