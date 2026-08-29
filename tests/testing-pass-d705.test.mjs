import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

/* D705 · Eleven things found in one testing pass, built as one batch. Each
   assertion below is the rule, not the instance — written so that reintroducing
   the defect anywhere fails, rather than only reintroducing it in the exact
   place it was found. */

test("the video that plays follows the screen, not the step number — D705", async () => {
  const videos = await read("app/step-videos.ts");
  const app = await read("app/listing-factory-app.tsx");
  const support = await read("app/support-chat.tsx");

  /* The rail says four steps. The app renders more screens than that: step 2 is
     two screens either side of `complete`, and step 3 has three phases. A map of
     four would play the wrong video on three of them. */
  assert.match(videos, /workflowStep === "designs"\) return complete \? "images" : "designs"/,
    "step 2 splits on complete — before drafts you are uploading, after you are on images");
  for (const screen of ["connect", "setup", "designs", "images", "details", "etsy", "mockups", "final"])
    assert.ok(videos.includes(`"${screen}"`), `${screen} is a real screen and needs a key`);

  /* The component knew nothing about the workflow before this. */
  assert.match(support, /export default function SupportChat\(\{ screen \}/);
  assert.match(app, /<SupportChat screen=\{workflowScreen\(workflowStep,finishPhase,complete\)\} \/>/);

  /* A screen with no video yet renders no button. A control that opens nothing
     is worse than no control, and this is what lets the videos be filmed one at
     a time without a dead icon showing in the meantime. */
  assert.match(support, /\{videoId \? <button/,
    "the launcher is conditional on a video existing for this screen");

  /* Ids, not URLs: the same id builds the embed src and the share link, and a
     share URL pasted into a map of embed URLs fails as a blank frame. */
  assert.match(videos, /loom\.com\/embed\/\$\{id\}/);
  assert.doesNotMatch(videos, /STEP_VIDEOS[^;]*loom\.com/s,
    "STEP_VIDEOS holds ids; the URL is built in one place");
});

test("every list in the help dialog draws its markers — D705", async () => {
  const globals = await read("app/globals.css");
  /* display:grid on a <ul> or <ol> suppresses ::marker, so both the bullets and
     the step NUMBERS vanished while padding-left kept holding space for them. */
  assert.doesNotMatch(globals, /\.context-help-sections ul,\.context-help-sections ol\{display:grid/,
    "grid items generate no markers");
  assert.match(globals, /\.context-help-sections ol\{list-style:decimal\}/);
  assert.match(globals, /\.context-help-sections ul\{list-style:disc\}/);
});

test("copy that belongs under the Printify steps is not its own topic — D705", async () => {
  const app = await read("app/listing-factory-app.tsx");
  const help = await read("app/context-help.tsx");
  assert.doesNotMatch(app, /heading:"Goldie handles the rest"/,
    "it read as a new subject when it is the last word on the setup steps");
  assert.match(app, /after:"You do not need to finish every listing choice in Printify\./);
  assert.match(help, /section\.after \? <p className="context-help-after">/);
});

test("an open listing can be closed from where reading ends — D705", async () => {
  const rows = await read("app/listing-rows.tsx");
  const css = await read("app/clarity-pass.css");
  assert.match(rows, /className="listing-card-done" onClick=\{\(\) => toggle\(row\.key\)\}/);
  assert.match(css, /\.listing-card\.is-open>\.listing-card-head\{[^}]*position:sticky/s,
    "the head must stay reachable at any scroll depth inside a tall listing");
  /* Deliberately not a click-anywhere close: the body is a form, and a stray
     click while editing a title must not throw the panel shut. */
  assert.doesNotMatch(rows, /listing-card-detail" onClick/);
});

test("readings do not wear button chrome, and confirmation is centred — D705", async () => {
  const css = await read("app/clarity-pass.css");
  assert.match(css, /\.app-shell \.fee-profile-summary span\{[^}]*border:0!important/s,
    "the Etsy fee figures are readings, not controls");
  assert.match(css, /\.app-shell \.pricing-approved-state\{margin:14px auto 0!important\}/,
    "it confirms the whole card, so it belongs under the middle of it");
});

test("one chevron, centred, for every disclosure in the app — D705", async () => {
  const sheets = await Promise.all(
    ["app/clarity-pass.css", "app/approved-functional.css"].map(read),
  );
  const live = sheets.join("\n");
  /* U+2304 is a modifier letter and sits low in its em box by design — that is
     the arrow that "sits so low". It was used in two rules and "↓" in two more,
     at three different sizes. */
  const glyphs = live.match(/content:\s*"[⌄↓]"/g) || [];
  assert.equal(glyphs.length, 0, `hand-drawn arrow glyphs left behind: ${glyphs.join(", ")}`);
  assert.match(sheets[0], /--goldie-chevron:url\("data:image\/svg\+xml/);
});

test("a destructive switch does not describe itself as additive — D705", async () => {
  const tools = await read("app/factory-tools.tsx");
  const app = await read("app/listing-factory-app.tsx");
  assert.match(tools, /<small>Starts a new batch<\/small>/);
  /* The warning has to be true: confirm that choosing really does discard. */
  assert.match(app, /This removes \$\{count\} \$\{count===1\?"design":"designs"\} and all work from the current batch/);
});

test("the summary line carries what differs, not what everything has — D705", async () => {
  const tools = await read("app/factory-tools.tsx");
  assert.doesNotMatch(tools, /parts\.push\("keyword bank"\)/);
  assert.match(tools, /Connect a product template to Printify once\./);
});
