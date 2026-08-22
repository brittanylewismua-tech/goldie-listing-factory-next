/* Readiness for one product in a batch.
 *
 * WHERE CHOICES LIVE. The Printify template is not where a seller picks colours
 * and sizes. The three things the app tells them to do there are: choose the
 * product and print provider, set the artwork placement, and publish once to Etsy
 * so a shipping profile exists. Whatever variants are enabled on that product are
 * therefore incidental — Printify's defaults, or the minimum needed to publish.
 * Treating them as the seller's intent would put listings live in colours they
 * never chose, so `templateEnabled` only ever SUGGESTS a starting selection; it
 * can never mark a product ready.
 *
 * Colours and sizes are chosen in the Listing Factory, once per product. The
 * wizard is not "ask nothing" — it is "ask once, then never again".
 *
 * Two things this exists to fix.
 *
 * 1. `setupComplete` on the recipe is not trustworthy. The API reads it as
 *    `saved.setupComplete !== false`, so it is true for every recipe that never
 *    explicitly stored false — including recipes with no colours, no sizes and no
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
export type FacetName = "colours" | "sizes" | "mockups" | "keywords";

export type Facet = {
  name: FacetName;
  state: ReadinessState;
  label: string;
  resolved?: { colourIds?: number[]; sizeIds?: number[]; mockupTheme?: string; mockupIds?: string[]; keywordListId?: string };
  /* A starting selection for a facet that must still be confirmed. Never treated
   * as an answer. */
  suggested?: { colourIds?: number[]; sizeIds?: number[] };
  note?: string;
};

export type ReadinessInput = {
  colourOptions: Array<{ id: number; title: string; available: boolean; templateEnabled: boolean }>;
  sizeOptions: Array<{ id: number; title: string; available: boolean; templateEnabled: boolean }>;
  compatibleMockupThemes: string[];
  keywordBanks: Array<{ id: string; name: string }>;
  saved: {
    defaultColorIds?: number[];
    defaultSizeIds?: number[];
    defaultMockupTheme?: string;
    mockupIds?: string[];
    keywordListId?: string;
    mockupsDeclined?: boolean;
  };
};

export type Readiness = {
  facets: Facet[];
  established: boolean;
  questions: FacetName[];
  autoResolved: NonNullable<Facet["resolved"]>;
};

function colourFacet(input: ReadinessInput): Facet {
  const available = input.colourOptions.filter((colour) => colour.available);
  const saved = (input.saved.defaultColorIds || []).filter((id) => available.some((colour) => colour.id === id));
  if (saved.length) {
    const names = saved.map((id) => available.find((colour) => colour.id === id)?.title).filter(Boolean);
    return { name: "colours", state: "ready", label: `${saved.length} ${saved.length === 1 ? "colour" : "colours"}`, note: names.slice(0, 3).join(", ") };
  }
  if (!available.length) return { name: "colours", state: "ready", label: "No colour choices" };
  /* Never auto-resolve. The template's enabled colours are Printify's doing, not
   * the seller's, so they open the picker pre-selected and wait for confirmation. */
  const suggested = available.filter((colour) => colour.templateEnabled).map((colour) => colour.id);
  return {
    name: "colours",
    state: "ask",
    label: "",
    suggested: { colourIds: suggested.length ? suggested : available.map((colour) => colour.id) },
    note: `${available.length} available`,
  };
}

function sizeFacet(input: ReadinessInput): Facet {
  if (!input.sizeOptions.length) return { name: "sizes", state: "ready", label: "One size" };
  const available = input.sizeOptions.filter((size) => size.available);
  const saved = (input.saved.defaultSizeIds || []).filter((id) => available.some((size) => size.id === id));
  if (saved.length) return { name: "sizes", state: "ready", label: `${saved.length} ${saved.length === 1 ? "size" : "sizes"}` };
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

function mockupFacet(input: ReadinessInput): Facet {
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

function keywordFacet(input: ReadinessInput): Facet {
  const banks = input.keywordBanks;
  const savedId = (input.saved.keywordListId || "").trim();
  const saved = banks.find((bank) => bank.id === savedId);
  if (saved) return { name: "keywords", state: "ready", label: saved.name };
  if (banks.length === 1) return { name: "keywords", state: "auto", label: banks[0].name, resolved: { keywordListId: banks[0].id } };
  if (!banks.length) return { name: "keywords", state: "ask", label: "", note: "Create a keyword bank first" };
  return { name: "keywords", state: "ask", label: "", note: `${banks.length} banks to choose from` };
}

export function productReadiness(input: ReadinessInput): Readiness {
  const facets = [colourFacet(input), sizeFacet(input), mockupFacet(input), keywordFacet(input)];
  const autoResolved: NonNullable<Facet["resolved"]> = {};
  for (const facet of facets) if (facet.state === "auto" && facet.resolved) Object.assign(autoResolved, facet.resolved);
  const questions = facets.filter((facet) => facet.state === "ask").map((facet) => facet.name);
  return { facets, established: questions.length === 0, questions, autoResolved };
}
