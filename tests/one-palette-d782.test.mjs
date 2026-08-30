import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import postcss from "postcss";

/* D782 · One palette.
 *
 * Counted every colour actually rendered inside the pane on step 3 against the
 * same count on the prototype: 91 distinct against 51. The extra forty were not
 * drift - they were two whole themes this app used to wear, still winning
 * elements the migration never named. A cream and gold one (#FBF6F1 behind a
 * listing row, #76531C on a link, #D2C4AE on a toggle) and a lilac one (#6547B5
 * filling a selected pill, #EEE9FA and #D7CAEF on the tag chips). Which one won
 * an element depended on where its rule happened to sit in the cascade, so one
 * screen could show gold, periwinkle, plum and rose at once.
 *
 * The peach-glass palette is plum, with rose for alerts, green for success, and
 * neutrals. Nothing in it is warm-gold (hue 20-70) or blue-violet (hue 180-300).
 * This fails when a rule that can reach the Listing Factory introduces one.
 */

const rgbToHsl = (red, green, blue) => {
  const [r, g, b] = [red / 255, green / 255, blue / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  if (!delta) return [0, 0, Math.round(lightness * 100)];
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = max === r ? (g - b) / delta + (g < b ? 6 : 0) : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return [Math.round(hue * 60), Math.round(saturation * 100), Math.round(lightness * 100)];
};

const hexToHsl = (hex) => {
  let value = hex.replace("#", "");
  if (value.length === 3) value = value.split("").map(c => c + c).join("");
  const [r, g, b] = [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16));
  return rgbToHsl(r, g, b);
};

/* A rule can reach the factory if it is scoped to the migrated shell or names
   one of its components. Everything else in these sheets styles other pages -
   the mastermind, usage, the management screens - and keeps its own colours. */
const reachesTheFactory = (selector) =>
  /\.app-shell|\.factory-|\.workflow-|\.step-card|\.listing-card|\.keyword-bank|\.title-style-toggle|\.tag-row|\.recipe-|\.batch-product/.test(selector);

const offenders = [];
for (const name of readdirSync(new URL("../app", import.meta.url)).filter(file => file.endsWith(".css"))) {
  postcss.parse(readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8")).walkDecls(decl => {
    if (!/color$|^background$|^border/.test(decl.prop)) return;
    const selector = decl.parent.selector || "";
    if (!reachesTheFactory(selector)) return;
    const literals = [
      ...[...decl.value.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)].map(m => [m[0], hexToHsl(m[0])]),
      /* rgba() carries hue too - the last lilac surfaces in the app were
         written rgba(225,199,239,.78) and rgba(224,195,241,.62), which a
         hex-only sweep walks straight past. */
      ...[...decl.value.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g)].map(m => [m[0] + ")", rgbToHsl(+m[1], +m[2], +m[3])]),
    ];
    for (const [raw, [hue, saturation, lightness]] of literals) {
      /* Near-neutrals carry almost no hue and read as grey whatever their
         nominal angle; the near-black and near-white ends likewise. */
      if (saturation < 12 || lightness < 8 || lightness > 97) continue;
      const warmGold = hue >= 20 && hue < 70;
      const blueViolet = hue >= 180 && hue < 300;
      if (!warmGold && !blueViolet) continue;
      offenders.push(`${name}: ${selector.replace(/\s+/g, " ").slice(0, 52)} — ${raw} (hue ${hue}, ${warmGold ? "the cream/gold theme" : "the lilac theme"})`);
    }
  });
}

test("the Listing Factory wears one palette, not three", () => {
  assert.deepStrictEqual(offenders, []);
});
