/**
 * HOW A DESIGN RELATES TO WHAT HAS MOVED, WITHOUT TELLING ANYONE TO COPY.
 *
 * The line this has to walk: a seller is allowed to know that slogan-led
 * designs are what is selling in their niche right now. They are not
 * entitled to be told which slogan, whose mascot, or what flower to add.
 *
 * So the comparison works on STRATEGY — how loud the type is, how much of the
 * frame the art takes, whether it survives a thumbnail — and never on
 * content. Nothing here reads a reference's wording, and nothing it produces
 * can name one.
 */
export type Ingredients = {
  wordCount: number;
  typography: string;
  textHierarchy: string;
  layout: string;
  illustration: string;
  textToArt: number;
  colorStrategy: string;
  contrast: string;
  thumbnailReadability: string;
  density: string;
  printCoverage: number;
  mechanism: string;
};

export type Alignment = {
  /* Plain, and never a number the member has to interpret. */
  overall: "Strong alignment" | "Promising, but unclear at thumbnail size"
    | "Visually strong, weak niche alignment" | "Not enough verified niche evidence yet";
  working: string[];
  opportunity: string;
};

const commonest = (values: string[]) => {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? { value: best[0], share: best[1] / Math.max(1, values.length) } : null;
};

const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/* A pattern only counts when most of the cohort shares it. */
const SHARED = 0.55;

export function compare(
  design: Ingredients, cohort: Ingredients[], { minimum = 12 }: { minimum?: number } = {},
): Alignment {
  if (cohort.length < minimum)
    return { overall: "Not enough verified niche evidence yet", working: [],
      opportunity: "" };

  const working: string[] = [];
  const gaps: Array<{ weight: number; say: string }> = [];

  /* Mechanism: bold slogan, emblem, mascot, distressed type, minimal icon. */
  const mechanism = commonest(cohort.map(row => row.mechanism));
  if (mechanism && mechanism.share >= SHARED) {
    if (design.mechanism === mechanism.value)
      working.push(`Your design uses the ${mechanism.value} approach that most `
        + `listings with verified momentum here are using.`);
    else
      gaps.push({ weight: 3, say: `Most listings moving in this niche lead with a `
        + `${mechanism.value}. Yours leads with a ${design.mechanism || "different approach"} — `
        + `worth testing that direction in your own words.` });
  }

  /* Thumbnail readability is the one that costs a sale silently. */
  const readable = cohort.filter(row => row.thumbnailReadability === "readable").length
    / cohort.length;
  if (design.thumbnailReadability === "readable" && readable >= SHARED)
    working.push("It stays readable at thumbnail size, like the listings that are moving.");
  else if (design.thumbnailReadability !== "readable")
    gaps.push({ weight: 5, say: "It gets hard to read at thumbnail size. That is where "
      + "buyers see it first, and it is the single biggest thing to fix here." });

  /* Wording length: a strategy, not a phrase. */
  const words = median(cohort.map(row => row.wordCount));
  if (words > 0) {
    if (Math.abs(design.wordCount - words) <= Math.max(1, words * 0.5))
      working.push(`Your wording is about as long as what is working here `
        + `(around ${words} word${words === 1 ? "" : "s"}).`);
    else if (design.wordCount > words * 1.6)
      gaps.push({ weight: 4, say: `Listings moving here carry around `
        + `${words} word${words === 1 ? "" : "s"}; yours carries ${design.wordCount}. `
        + `Cutting it back usually helps it read at small sizes.` });
  }

  /* How much of the print area is used. */
  const coverage = median(cohort.map(row => row.printCoverage));
  if (coverage > 0 && design.printCoverage < coverage * 0.6)
    gaps.push({ weight: 2, say: "Your artwork sits smaller in the print area than "
      + "most of what is moving. Filling more of it tends to read better on the garment." });
  else if (coverage > 0 && Math.abs(design.printCoverage - coverage) < coverage * 0.25)
    working.push("It fills the print area about as much as the listings that are moving.");

  const contrast = commonest(cohort.map(row => row.contrast));
  if (contrast && contrast.share >= SHARED && design.contrast === contrast.value)
    working.push(`Its contrast matches the ${contrast.value} look that is doing well here.`);

  gaps.sort((a, b) => b.weight - a.weight);

  /*
    The overall read. Thumbnail trouble is called out even when everything
    else aligns, because a design nobody can read has not got a niche problem.
  */
  const aligned = working.length >= 2;
  const overall: Alignment["overall"] =
    design.thumbnailReadability !== "readable" && aligned
      ? "Promising, but unclear at thumbnail size"
      : aligned ? "Strong alignment"
      : working.length && design.thumbnailReadability === "readable"
        ? "Visually strong, weak niche alignment"
        : "Visually strong, weak niche alignment";

  return {
    overall,
    /* Three at most. A list of six is a list nobody acts on. */
    working: working.slice(0, 3),
    opportunity: gaps[0]?.say ?? "",
  };
}

/*
  Phrases that would cross from strategy into copying. Asserted against the
  output in tests so a future edit cannot quietly reintroduce them.
*/
export const FORBIDDEN_ADVICE = [
  "copy this", "add the same", "this will sell", "bestseller", "best seller",
  "top seller", "use this phrase", "use this design", "replicate",
];
