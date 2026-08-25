import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

/* WHY THIS FILE EXISTS
 *
 * Brittany has twice lost sight of a working feature during this rebuild — the
 * grouped per-size pricing and the download-all button — and both times the
 * feature was still in the code, sitting on a screen she was no longer being
 * shown. Nothing was deleted; the flow grew a second place to look and the old
 * place stopped being reachable.
 *
 * The workflow is about to be restructured from five steps into four pages, and
 * that is exactly the kind of change that strands a component: it survives in
 * the file, renders nowhere, and no test notices because the code still parses.
 *
 * So this is a tripwire, not a unit test. Every component below is RENDERED in
 * the app today. If a restructure strands one, this fails and names it. A
 * component may only leave this list deliberately, by editing this file, which
 * forces the removal to be a decision rather than an accident. */

const RENDERED_COMPONENTS = [
  "ActionReceipt", "BatchPreferencesPortal", "ContextHelp", "DownloadListingPhotos",
  "EtsyDetailsEditor", "FinalListingReview", "GoldieCommandBar", "GoldieInsight",
  "GoldieWordmark", "IndividualAutoTitle", "IndividualManualTitle", "IndividualSizeGuide",
  "IntegratedMockups", "KeywordBank", "ListingPhotoOrder", "MockupSetSelector", "NavIcon",
  "OutcomeReceipt", "PersonalizationEditor", "PriceField", "PricingReview",
  "PrintifyImagePicker", "ProductColorSelector", "ProductSizeSelector", "SavedWorkflow",
  "SupportChat", "WorkflowMomentum",
];

test("every component that renders today still renders", async () => {
  const app = await read("app/listing-factory-app.tsx");
  const stranded = RENDERED_COMPONENTS.filter((name) => !new RegExp(`<${name}[\\s/>]`).test(app));
  assert.deepEqual(stranded, [], `these components no longer render: ${stranded.join(", ")}`);
});

/* Named features whose loss would be quiet — no error, no blank screen, just a
 * capability that stops being reachable. Each is pinned to the string that
 * proves the behaviour, not merely the component. */
const FEATURES = [
  ["grouped per-size pricing", /Item prices \+ buyer-paid shipping/],
  ["pricing groups by identical Printify cost", /Goldie groups variants only when Printify charges the/],
  ["a price field per group", /<PriceField/],
  ["whole-number pricing toggle", /Create whole-number pricing/],
  ["download every listing photo as a zip", /function DownloadListingPhotos/],
  ["download-all is actually rendered", /<DownloadListingPhotos/],
  ["Printify product photos are selectable", /className="printify-image-picker"/],
  ["lifestyle mockups", /<IntegratedMockups/],
  ["mockups can be reordered", /<ListingPhotoOrder/],
  ["a size guide can be added to every listing", /Add one size guide to every Etsy listing/],
  ["AI titles for the whole batch", /Create titles for the whole batch/],
  ["manual title building from a bank", /Build this title yourself from a keyword bank/],
  ["per-listing description override", /Customize this listing’s description/],
  /* D232 · Deleting the settings block took this with it and no pin caught it —
     the shared editor survived, the way to keep the wording for future batches
     did not. A capability can be lost while its neighbour still renders. */
  ["a shared description for the whole batch", /Description for every listing/],
  ["saving that description as the product default", /Save this description as the default/],
  ["Etsy category selection", /Choose an Etsy category/],
  ["personalization questions", /<PersonalizationEditor/],
  /* D232 renamed this heading: "— what buyers pay" stated the obvious. */
  ["Etsy shipping profile choice", /<h4>Etsy shipping profile<\/h4>|Etsy shipping profile</],
  ["Printify draft creation", /Create Printify drafts →/],
  ["final review before publish", /<FinalListingReview/],
  ["the command bar", /<GoldieCommandBar/],
  ["support chat", /<SupportChat/],
  ["batch preferences", /<BatchPreferencesPortal/],
  ["clear batch and start over", /Clear batch \+ start over/],
];

test("every named feature is still reachable", async () => {
  const app = await read("app/listing-factory-app.tsx");
  const lost = FEATURES.filter(([, pattern]) => !pattern.test(app)).map(([name]) => name);
  assert.deepEqual(lost, [], `these features are no longer present: ${lost.join(", ")}`);
});

test("features that live outside the main file are still wired", async () => {
  const mockups = await read("app/integrated-mockups.tsx");
  assert.match(mockups, /Choose up to 8 lifestyle mockups/);
  assert.match(mockups, /download=\{r\.name\}/, "individual mockup downloads");
  assert.match(mockups, /Adjust this mockup only/, "per-mockup scale and position");

  const tools = await read("app/factory-tools.tsx");
  assert.match(tools, /export function KeywordBank/);
  assert.match(tools, /export function SavedWorkflow/);
  assert.match(tools, /product bundle/i, "bundles");
});

/* D512/D513 · The tripwire above catches a component that stopped rendering. It
 * cannot catch a component that renders with half its inputs missing, or one
 * fact worked out three times in three slightly different ways. Both happened. */
test("no capability is wired up only halfway", async () => {
  const app = await read("app/listing-factory-app.tsx");

  /* The recommended print size was computed in three places. Two fell back to
     `placementScale || 0`, the bundle check to `|| 1`, so a product with no
     placement scale was exempt from the resolution warning on its own and
     flagged inside a bundle. One function decides it. */
  assert.match(app, /export function printTargetFor\(template:TemplateDetails\|null\)/);
  assert.equal((app.match(/isRigidPaperProduct\([a-zA-Z]*\)\?Math\.min/g) || []).length, 1,
    "the scale rule is written once");
  assert.equal((app.match(/printTargetFor\(/g) || []).length, 6,
    "five call sites plus the definition - it was written out five times");

  /* MockupSetSelector takes selectedIds and firstRun. Neither was ever passed, so
     the first-run wording was dead for every seller and Goldie could not tell her
     scene picks had changed - which is what offers to save them. */
  assert.match(app, /<MockupSetSelector firstRun=\{productFirstRun\}/);
  assert.match(app, /selectedIds=\{sharedMockups\?\.theme===mockupTheme\?sharedMockups\.ids:\[\]\}/);
  assert.match(app, /savedIds=\{activeRecipe\?\.mockupIds\}/);
  assert.match(app, /onChange=\{\(theme,ids\)=>\{setMockupTheme\(theme\);if\(ids\)setSharedMockups\(\{theme,ids\}\)\}\}/,
    "the ids the selector reports are kept, not dropped");

  // And first run is a fact about the product, not about how it was opened.
  assert.doesNotMatch(app, /const productFirstRun=Boolean\(activeRecipe\)&&!activeBundle/);
});
