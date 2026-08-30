import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

/* D707 · Brown has been reported three times. Twice it was fixed at the exact
   place it was seen, and twice it came back somewhere else, because the thing
   going wrong is not a hex value - it is that desaturating red toward orange
   produces brown. This test states the rule instead of the instances.

   "Brown" here means: hue 4-52 degrees, saturation at or above 25%, lightness
   between 18% and 64%. The lightness floor matters - the old dark theme is
   full of near-blacks like #17130d that sit in the same hue band and are not
   accents. The rule is applied to selectors that carry attention meaning,
   because those are the ones a seller reads as "something is wrong here". */

const ATTENTION = /warning|error|missing|failed|failure|attention|needs-setup|profit-low|mismatch|remove-batch|invalid|danger/i;

function rgb(token) {
  const hex = /^#([0-9a-f]{6})$/i.exec(token.trim());
  if (hex) { const n = parseInt(hex[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255, 1]; }
  const fn = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?/i.exec(token);
  return fn ? [+fn[1], +fn[2], +fn[3], fn[4] === undefined ? 1 : +fn[4]] : null;
}
function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, Math.round(l * 100)];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round(h * 60), Math.round(s * 100), Math.round(l * 100)];
}
const isBrown = (token) => {
  const c = rgb(token);
  if (!c || c[3] < 0.3) return false;
  const [h, s, l] = hsl(c);
  return h >= 4 && h <= 52 && s >= 25 && l >= 18 && l <= 64;
};

async function sheets(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await sheets(path, out);
    else if (entry.name.endsWith(".css")) out.push(path);
  }
  return out;
}

test("no attention state is painted brown — D707", async () => {
  const files = await sheets(new URL("../app", import.meta.url).pathname);
  const offences = [];
  for (const file of files) {
    const css = await readFile(file, "utf8");
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!ATTENTION.test(selector)) continue;
      for (const token of body.match(/#[0-9a-f]{6}\b|rgba?\([^)]*\)/gi) || []) {
        if (!isBrown(token)) continue;
        const [h, s, l] = hsl(rgb(token));
        offences.push(`${file.split("/app/")[1]}  ${selector.trim().slice(0, 56)}  ${token}  (h${h} s${s}% l${l}%)`);
      }
    }
  }
  assert.deepEqual(offences, [],
    `attention states must use the rose token, not brown:\n${offences.join("\n")}`);
});

test("the rose token exists and is genuinely red, not orange — D707", async () => {
  /* D721 · token moved to interface-v2.css with the shell. */
  const css = await readFile(new URL("../app/interface-v2.css", import.meta.url), "utf8");
  const declared = /--goldie-attention:\s*(#[0-9a-f]{6})/i.exec(css);
  assert.ok(declared, "--goldie-attention must be defined by whichever sheet owns .app-shell");
  const [h, s] = hsl(rgb(declared[1]));
  /* The failure mode this guards is a future "tone it down" pass sliding the
     hue toward orange, which is precisely how brown was reintroduced twice. */
  assert.ok(h <= 8 || h >= 340, `attention hue must stay at red, got ${h} degrees`);
  assert.ok(s >= 40, `attention colour must keep its saturation, got ${s}%`);
});
