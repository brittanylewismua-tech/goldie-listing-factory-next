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
import { QUALITY_RULE_VERSION } from "./image-quality.ts";

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

/*
  THE SENTENCES THAT ARE CLAIMS ABOUT A MEASUREMENT.

  Named once, used both by the live comparison and by the gate that re-checks
  a stored result on the way out, so a stored claim cannot drift away from the
  rule that is supposed to govern it.
*/
export const CLAIM_READABLE =
  "It stays readable at thumbnail size, like the listings that are moving.";
export const CLAIM_HARD_TO_READ = "It gets hard to read at thumbnail size. That is where "
  + "buyers see it first, and it is the single biggest thing to fix here.";
export const CLAIM_LOW_CONTRAST =
  "The light and dark areas in this design are too close together to read easily.";
export const NOTE_UNMEASURED = "Readability at thumbnail size could not be measured "
  + "from this file, so nothing below is a claim about how it reads — treat the "
  + "comparison as being about construction.";
export const NO_GAP = "No clear visual-construction issue surfaced in this comparison.";

/*
  D1754 · A STORED RESULT IS NOT GOVERNED BY THE GATE THAT WROTE IT.

  The gate corrected in D1751 runs while a scan is being produced. Results
  written before it kept their text verbatim in `scan_history`, so reopening an
  old scan replayed exactly the contradiction the gate exists to prevent — "It
  stays readable at thumbnail size" beside "this design's readability has not
  been measured". Correct new scans do not make old ones safe.

  So every stored result is versioned, and any result not carrying the current
  version is re-gated against the measurement as it stands now, read from the
  stored analysis. No provider call, no allowance, no re-scan: the only inputs
  are rows that already exist.
*/
export const COMPARISON_VERSION = 2;

type MeasuredQuality = import("./image-quality.ts").ImageQuality;

export type MeasuredState = { pass: boolean; fail: boolean; unknown: boolean };

/* A verdict produced by rules that have since been replaced is not a
   measurement. Checked here as well as at the read, so neither layer alone is
   load-bearing. */
const current = (measured?: MeasuredQuality) =>
  measured && measured.ruleVersion === QUALITY_RULE_VERSION ? measured : undefined;

export const readableState = (given?: MeasuredQuality): MeasuredState => {
  const measured = current(given);
  const unknown = !measured || measured.thumbnailReadable === "unverified";
  return { unknown, pass: !unknown && !!measured?.mayClaimReadable,
    fail: !unknown && !measured?.mayClaimReadable };
};
export const contrastState = (given?: MeasuredQuality): MeasuredState => {
  const measured = current(given);
  const unknown = !measured || measured.contrast === "unverified";
  return { unknown, pass: !unknown && !!measured?.mayClaimHighContrast,
    fail: !unknown && !measured?.mayClaimHighContrast };
};

type StoredResult = {
  overall?: string; working?: string[]; opportunity?: string;
  comparisonVersion?: number;
  imageQuality?: { contrast?: string; sharpness?: string;
    thumbnailReadable?: string; notes?: string[] };
};

const CLAIMS_READ_PASS = /stays readable at thumbnail size/i;
const CLAIMS_CONTRAST_PASS = /contrast matches the .* look/i;
const CLAIMS_READ_FAIL = /hard to read at thumbnail size/i;
const CLAIMS_CONTRAST_FAIL = /too close together to read easily|light and dark areas/i;

/**
 * Re-gate a stored result against the measurement that exists now.
 *
 * A positive claim survives only on a measured pass; a warning survives only
 * on a measured fail; an unknown measurement leaves neither, and says so. The
 * verdict label is recomputed from what is left, because a "Strong" label
 * resting on a claim that has just been removed is the same contradiction one
 * step further up the page.
 */
export function gateStoredResult(stored: StoredResult, given?: MeasuredQuality) {
  const measured = current(given);
  const read = readableState(measured), contrast = contrastState(measured);
  const before = JSON.stringify([stored.working ?? [], stored.opportunity ?? "",
    stored.overall ?? "", stored.imageQuality ?? null]);

  const working = (stored.working ?? []).filter(line =>
    !(CLAIMS_READ_PASS.test(line) && !read.pass)
    && !(CLAIMS_CONTRAST_PASS.test(line) && !contrast.pass));

  let opportunity = stored.opportunity ?? "";
  const unfoundedWarning =
    (CLAIMS_READ_FAIL.test(opportunity) && !read.fail)
    || (CLAIMS_CONTRAST_FAIL.test(opportunity) && !contrast.fail);
  /* A stale "could not be measured" note is equally a claim: it is right only
     while the measurement is still unknown. */
  const staleNote = opportunity.includes("could not be measured")
    && !(read.unknown || contrast.unknown);
  if (unfoundedWarning || staleNote)
    opportunity = read.unknown || contrast.unknown ? NOTE_UNMEASURED : NO_GAP;
  /* Nothing on the page says the measurement is missing: say it. */
  else if ((read.unknown || contrast.unknown) && !opportunity.includes("could not be measured")
    && working.length !== (stored.working ?? []).length)
    opportunity = NOTE_UNMEASURED;

  let overall = stored.overall ?? "";
  if (overall !== "Not enough verified evidence") {
    if (working.length === 0) overall = "Weak visual-pattern alignment";
    else if (working.length < 2 && overall === "Strong visual-pattern alignment")
      overall = "Moderate visual-pattern alignment";
  }

  /* The panel that reports the measurement is rewritten from the measurement
     itself, so it can never disagree with the sentences above it. */
  const imageQuality = measured
    ? { contrast: measured.contrast, sharpness: measured.sharpness,
        thumbnailReadable: measured.thumbnailReadable, notes: measured.notes }
    : { contrast: "unverified", sharpness: "unverified",
        thumbnailReadable: "unverified",
        notes: ["This design's readability has not been measured. Scan it "
          + "again with the file to check it."] };

  const result = { ...stored, overall, working, opportunity, imageQuality,
    comparisonVersion: COMPARISON_VERSION };
  return { result,
    changed: JSON.stringify([working, opportunity, overall, imageQuality]) !== before };
}

export function compare(
  design: Ingredients, cohort: Ingredients[],
  { minimum = 12, measured }:
    { minimum?: number;
      /* Measured pixel facts. When present they overrule the model on
         readability and contrast — never the other way round. */
      measured?: MeasuredQuality } = {},
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
    working.push(CLAIM_READABLE);
  else if (quality === "fail")
    gaps.push({ weight: 5, say: CLAIM_HARD_TO_READ });
  else if (quality === "unknown")
    gaps.push({ weight: 2, say: NOTE_UNMEASURED });

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
      ?? CLAIM_LOW_CONTRAST });

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
      ?? NO_GAP,
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
