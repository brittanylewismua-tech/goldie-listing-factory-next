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

/* D786 · One exemption, by name.
 *
 * The orb behind the pane is violet on purpose - rgba(184,174,255) and
 * rgba(188,181,255) are two of its six stops in the approved prototype. D782's
 * sweep could not tell approved decoration from a leftover theme and muted it
 * to plum, and then this test locked the mistake in by forbidding the hue it
 * had just removed. A rule that bans a colour the preview uses is not a
 * fidelity test.
 *
 * It is exempt by selector, not by hue: any OTHER rule introducing violet still
 * fails. If a second piece of approved decoration needs a hue outside the
 * palette, it gets its own line here and a reason, so the list of things that
 * are allowed to break the palette stays short and readable. */
const APPROVED_DECORATION = [".app-shell > .factory-main::before"];
/* D821 · and the pane itself. Its second gradient stop is rgba(238,218,239,.9)
   - hue 297, inside the band this test forbids - because that is what the
   approved prototype's .goldie-main computes to, read off its own CSSOM.
   Production had rgba(232,214,226,.9), a greyer pink, which passed this test
   and did not match the design.

   This is the same distinction the orb exemption draws: the test exists to
   catch violet that was invented here, not violet that was measured off the
   thing we are copying. A value only earns this list by being read from the
   prototype and named with the element it was read from. */
const APPROVED_MEASURED = new Map([[".app-shell > .factory-main", "rgba(238,218,239"]]);

const offenders = [];
for (const name of readdirSync(new URL("../app", import.meta.url)).filter(file => file.endsWith(".css"))) {
  postcss.parse(readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8")).walkDecls(decl => {
    if (!/color$|^background$|^border/.test(decl.prop)) return;
    const selector = decl.parent.selector || "";
    if (!reachesTheFactory(selector)) return;
    if (APPROVED_DECORATION.some(allowed => selector.replace(/\s+/g, " ").trim() === allowed)) return;
    const measured = APPROVED_MEASURED.get(selector.replace(/\s+/g, " ").trim());
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
      if (measured && raw.startsWith(measured)) continue;
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
