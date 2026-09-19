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

/**
 * WHAT THESE LABELS ARE ALLOWED TO CLAIM.
 *
 * The comparison layer cannot read a reference's wording or subject matter —
 * deliberately, and permanently. So it cannot know whether a design's SUBJECT
 * is right for a niche. It knows only whether the design is BUILT the way the
 * listings that are moving are built.
 *
 * "Strong alignment" therefore overstated it. Every label now says
 * visual-pattern, because that is the entire scope of what was measured, and a
 * member who reads only the headline should still not be misled.
 */
export type Alignment = {
  /* Plain, and never a number the member has to interpret. */
  overall: "Strong visual-pattern alignment" | "Moderate visual-pattern alignment"
    | "Weak visual-pattern alignment" | "Not enough verified evidence";
  working: string[];
  opportunity: string;
  /* One line saying what was actually compared. Never a wall of caveats. */
  scope: string;
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

/* "a illustrated scene" shipped to a member once. It will not again. */
const article = (word: string) => /^[aeiou]/i.test(word.trim()) ? "an" : "a";

export function compare(
  design: Ingredients, cohort: Ingredients[],
  { minimum = 12, measured }:
    { minimum?: number;
      /* Measured pixel facts. When present they overrule the model on
         readability and contrast — never the other way round. */
      measured?: import("./image-quality.ts").ImageQuality } = {},
): Alignment {
  if (cohort.length < minimum)
    return { overall: "Not enough verified evidence", working: [],
      opportunity: "", scope: "" };

  const working: string[] = [];
  const gaps: Array<{ weight: number; say: string }> = [];

  /* Mechanism: bold slogan, emblem, mascot, distressed type, minimal icon. */
  const mechanism = commonest(cohort.map(row => row.mechanism));
  if (mechanism && mechanism.share >= SHARED) {
    if (design.mechanism === mechanism.value)
      working.push(`Your design uses the ${mechanism.value} approach that most `
        + `listings with verified momentum here are using.`);
    else
      gaps.push({ weight: 3, say: `Most listings moving in this niche lead with `
        + `${article(mechanism.value)} ${mechanism.value}. Yours leads with `
        + `${article(design.mechanism)} ${design.mechanism || "a different approach"} — `
        + `worth testing that direction in your own words.` });
  }

  /*
    Thumbnail readability is the one that costs a sale silently.

    MEASURED PIXELS OVERRULE THE MODEL. A vision model told a member that a
    7px-blurred design and a near-invisible grey-on-white design both "stay
    readable at thumbnail size". The gate below was always correct; its input
    was an opinion. `measured` is arithmetic, and when it says the design
    cannot be read, no description can turn the positive claim back on.
  */
  const readable = cohort.filter(row => row.thumbnailReadability === "readable").length
    / cohort.length;

  /*
    NO MEASUREMENT AND A FAILED MEASUREMENT ARE THE SAME ANSWER: SAY NOTHING.

    `measuredUnverified` only looked inside a verdict that existed. When the
    decode failed there was no verdict at all, so it was false, and the
    model's opinion walked straight through the gate — the live result told a
    member "It stays readable at thumbnail size" on the same screen as "this
    design's readability has not been measured". The comment at the decode
    said "unverified is the honest answer; it blocks the claim". It did not.

    Three states, and only three:
      pass       measured, and the measurement permits the claim
      fail       measured, and the measurement refuses it
      unknown    no measurement, or one that could not decide

    A positive claim needs `pass`. A warning needs `fail`. `unknown` says
    only that it is unknown. The model never decides this on its own.
  */
  const quality: "pass" | "fail" | "unknown" =
    !measured || measured.thumbnailReadable === "unverified" ? "unknown"
    : measured.mayClaimReadable ? "pass"
    : "fail";

  if (quality === "pass"
      && design.thumbnailReadability === "readable" && readable >= SHARED)
    working.push("It stays readable at thumbnail size, like the listings that are moving.");
  else if (quality === "fail")
    gaps.push({ weight: 5, say: "It gets hard to read at thumbnail size. That is where "
      + "buyers see it first, and it is the single biggest thing to fix here." });
  else if (quality === "unknown")
    gaps.push({ weight: 2, say: "Readability at thumbnail size could not be measured "
      + "from this file, so nothing below is a claim about how it reads — treat the "
      + "comparison as being about construction." });

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
  /*
    THE SAME THREE STATES, AND THE SAME HOLE THAT WAS IN READABILITY.

    This read `!measured || measured.mayClaimHighContrast`, so having no
    measurement PERMITTED the claim rather than withholding it. Live, that
    printed "Its contrast matches the high look that is doing well here" on a
    design whose contrast had never been measured — beside a panel saying so.

    An unmeasured design gets no contrast claim in either direction.
  */
  const contrastQuality: "pass" | "fail" | "unknown" =
    !measured || measured.contrast === "unverified" ? "unknown"
    : measured.mayClaimHighContrast ? "pass"
    : "fail";

  if (contrastQuality === "pass"
      && contrast && contrast.share >= SHARED && design.contrast === contrast.value)
    working.push(`Its contrast matches the ${contrast.value} look that is doing well here.`);
  else if (contrastQuality === "fail")
    gaps.push({ weight: 5, say: measured?.notes.find(note => note.includes("read easily"))
      ?? "The light and dark areas in this design are too close together to read easily." });

  gaps.sort((a, b) => b.weight - a.weight);

  /*
    The overall read. Thumbnail trouble is called out even when everything
    else aligns, because a design nobody can read has not got a niche problem.
  */
  const aligned = working.length >= 2;
  const overall: Alignment["overall"] =
    aligned && design.thumbnailReadability === "readable"
      ? "Strong visual-pattern alignment"
      : aligned || working.length >= 1
        ? "Moderate visual-pattern alignment"
        : "Weak visual-pattern alignment";

  return {
    overall,
    /* Three at most. A list of six is a list nobody acts on. */
    working: working.slice(0, 3),
    /*
      Always exactly one line. A design that matches the cohort on everything
      measured has no gap to name, and an empty block reads as a bug rather
      than as good news — so it says what it actually means.
      It does NOT then claim that only reach is left: whether the subject
      lands with these buyers is exactly the thing this comparison never saw.
    */
    opportunity: gaps[0]?.say
      ?? "No clear visual-construction issue surfaced in this comparison.",
    scope: "Your design shares several visual construction patterns with "
      + "listings currently showing verified momentum in this niche.",
  };
}

/*
  Phrases that would cross from strategy into copying. Asserted against the
  output in tests so a future edit cannot quietly reintroduce them.
*/
export const FORBIDDEN_ADVICE = [
  "copy this", "add the same", "this will sell", "bestseller", "best seller",
  "top seller", "use this phrase", "use this design", "replicate",
  /* Claims about subject, market fit or what is "left" to do — all of which
     are outside what a construction comparison can see. */
  "what is left is reach", "nothing is holding", "right for this audience",
  "will resonate", "the only thing left",
];
