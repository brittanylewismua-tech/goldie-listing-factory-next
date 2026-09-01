import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/* D875 · The look, locked. Black rail, one pink at two strengths, white paper
   on a pink grid, a black primary with a pink offset. These are the decisions
   she made one at a time over a long afternoon; this is what stops them being
   undone by the next person who reaches for a colour. */

const css = fs.readFileSync(new URL("../app/interface-v2.css", import.meta.url), "utf8");
const mark = fs.readFileSync(new URL("../app/goldie-wordmark.tsx", import.meta.url), "utf8");

test("one pink, two strengths — never two hues", () => {
  /* A DARKER mix of #ff4fc3 reads as purple, which she rejected. The soft value
     is therefore an alpha of the bright one: over white it resolves to #ffb0e4,
     hue 321 against the bright pink's 320. Same colour, less of it. */
  assert.match(css, /--lf-pink:#ff4fc3/);
  assert.match(css, /--lf-pink-soft:rgba\(255,79,195,\.18\)/);
  assert.match(css, /--lf-grid:rgba\(255,79,195,\.10\)/);
  const hex = css.match(/--lf-pink-soft:\s*#[0-9a-f]{6}/i);
  assert.equal(hex, null, "the muted pink must stay an alpha of the bright one, not a darker hex");
});

test("the rail is black and carries the bright pink", () => {
  assert.match(css, /background: var\(--lf-rail\)/);
  assert.match(css, /--lf-rail:#000/);
  assert.match(css, /\.top-nav a\.active \{[\s\S]*?background: var\(--lf-pink\)/);
  /* One gear, cropped by the bottom-left corner, rotating behind the rail
     contents rather than bleeding through the counter surfaces. */
  assert.match(css, /\.app-shell > \.topbar::before\{[\s\S]*?left:-118px;bottom:-118px;[\s\S]*?animation:84s linear infinite lf-rail-gear-turn/);
  assert.match(css, /data:image\/svg\+xml,%3Csvg/);
});

test("the workspace is paper with a pink grid, and cards sit on it", () => {
  assert.match(css, /--lf-paper:#fdf8fb/);
  assert.match(css, /background: var\(--lf-paper\)/);
  assert.match(css, /repeating-linear-gradient\(90deg,transparent 0 47px,var\(--lf-grid\) 47px 48px\)/);
  /* Two shadows: a contact shadow that seats the card and a wide one that lifts
     it. A single mid-blur shadow is what makes a card look stuck to the page. */
  assert.match(css, /box-shadow:0 1px 2px rgba\(90,48,79,\.05\),0 10px 30px rgba\(90,48,79,\.06\)/);
});

test("the step rail keeps the bright pink", () => {
  /* Explicitly asked for: the numbers and the underline stay bright. Muting
     them was a mistake made once already. */
  assert.match(css, /button\.active > span:first-of-type\{background:var\(--lf-pink\);color:#1b0e17\}/);
  assert.match(css, /button\.active::after\s*\{[^}]*background:\s*var\(--lf-pink\)/,
    "the visible line beneath the active step must be pink, never legacy plum");
  assert.match(css, /button\.active\{color:#1b0e17\}/,
    "the active step label uses neutral ink, not a purple accent");
});

test("the selected product is a whisper, not a ring", () => {
  assert.match(css, /\.recipe-tile\.selected\{\s*border:1px solid var\(--lf-pink-soft\);background:#fffbfd;/);
  assert.match(css, /box-shadow:0 0 0 3px rgba\(255,79,195,\.04\),0 0 12px rgba\(255,79,195,\.07\)/);
});

test("Next step is black with a pink offset; Publish inverts it", () => {
  /* Flat saturated pink read cheap. The routine action is a black face with a
     pink edge; the one that spends money is a lit pink face with a deep-plum
     edge, because black would vanish on the publish panel. */
  assert.match(css, /\.workflow-next\{[^}]*background:#0d0b0c[^}]*box-shadow:4px 4px 0 var\(--lf-pink\)/);
  assert.match(css, /\.factory-footer\.in-bar > \*:not\(small\)\{[^}]*background:#0d0b0c[^}]*box-shadow:4px 4px 0 var\(--lf-pink\)/,
    "the footer's more-specific shared action rule must not repaint Next step plum");
  assert.match(css, /\.publish-all-button\{[\s\S]*?background:linear-gradient\(#ff6ecd,#f52fb2\);[\s\S]*?4px 4px 0 var\(--lf-action-shadow\)/);
  assert.match(css, /--lf-action-shadow:#000/);
  /* Both need a disabled state: these buttons spend most of their life gated. */
  assert.match(css, /\.workflow-next:disabled\{opacity:1;background:#efe7ec/);
});

test("the mark is the Listing Factory lockup, not the old Goldie type", () => {
  assert.match(mark, /listing-factory-lockup\.png/);
  assert.match(mark, /alt="Listing Factory"/);
  assert.doesNotMatch(mark, /goldie-wordmark-name|goldie-wordmark-i/,
    "the text lockup is gone; its type rules went with it");
  assert.ok(fs.existsSync(new URL("../public/listing-factory-lockup.png", import.meta.url)),
    "the asset ships with the app");
  assert.match(css, /\.goldie-wordmark-lockup img\{display:block;width:196px/);
});

test("the approved reference is a crisp grid without the old glowing orb", () => {
  assert.match(css, /\.app-shell > \.factory-main::before \{[\s\S]*?display:none;/);
});

test("the reference rail keeps opaque dark counters and its original spacing", () => {
  assert.match(css, /\.approved-usage\{\s*background:#0b0b0b;border:1\.5px solid #232323;color:#fff\}/);
  assert.match(css, /\.listing-goal-side\{\s*background:linear-gradient\(#141014,#0c0b0c\);border:1\.5px solid #3a2334;color:#fff\}/);
  assert.match(css, /\.app-shell > \.topbar\{overflow:hidden;padding-top:36px;padding-bottom:25px\}/);
  assert.match(css, /\.approved-usage b,[\s\S]*?\.approved-usage span,[\s\S]*?\.listing-goal-side b\{color:#fff\}/,
    "counter values must remain readable white on the black rail");
  const clarity = fs.readFileSync(new URL("../app/clarity-pass.css", import.meta.url), "utf8");
  assert.match(clarity, /\.app-shell \.approved-usage span\{color:#fff!important\}/,
    "the legacy important usage value is corrected at its source");
  assert.match(clarity, /\.app-shell \.listing-goal-side>b\{[\s\S]*?color:#fff!important/,
    "the legacy important goal value is corrected at its source");
});
