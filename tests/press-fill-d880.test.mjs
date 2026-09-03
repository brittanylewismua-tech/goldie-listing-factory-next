import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

/* D880 · D879 chased one plum gradient literal and shipped, and the "Choose"
   press on the product tile was still aubergine because it used a different
   pair (#6b3a58/#8a4f73). Matching on literals is what let that through, so
   this matches on colour instead: any dark desaturated magenta used as a FILL
   on something you press is a miss, whichever hex spells it.

   Ink, borders, tints and shadows are untouched — the plum ink IS the palette.
   Destructive actions and the deliberately dark surfaces are listed as
   exceptions so that removing one is a decision someone has to write down. */

const dir = new URL("../app/", import.meta.url);
const SHEETS = readdirSync(dir).filter(f => f.endsWith(".css"));

/* Destructive presses stay red; these panels are meant to be near-black. */
const ALLOWED = [
  /\.destructive/, /\.danger/, /confirmDelete/, /\.delete/i,
  /* The quiet secondary on the dark publish panel. Pink here would compete
     with the Publish press sitting directly above it. */
  /save-draft-confirm/,
  /factory-publish-box/, /workflow-next:hover/, /publish-confirm-actions button/,
  /batch-title-preview/, /save-toast/,
];

const isPlumFill = (hex) => {
  const h = hex.slice(1);
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return false;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let deg = (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  if (deg < 0) deg += 360;
  return deg >= 280 && deg <= 345 && l < 0.45 && s > 0.12;
};

const PRESSY = /button|press|\.use\b|recipe-use|next|publish|apply|save|resume|create|generate|download|confirm|launch|cta|goals-cta|choice-grid em|summary em/i;

test("no press is filled with the pre-factory plum, whichever hex spells it", () => {
  const offenders = [];
  for (const sheet of SHEETS) {
    const css = readFileSync(new URL(sheet, dir), "utf8");
    for (const rule of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const selector = rule[1].trim().split("\n").pop().trim();
      if (!PRESSY.test(selector)) continue;
      if (ALLOWED.some(rx => rx.test(selector))) continue;
      for (const decl of rule[2].matchAll(/background(?:-image|-color)?\s*:\s*([^;]+)/g)) {
        const hexes = decl[1].match(/#[0-9a-fA-F]{6}/g) || [];
        if (hexes.some(isPlumFill)) offenders.push(`${sheet}  ${selector}  -> ${decl[1].trim()}`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    `presses still filled with plum:\n${offenders.join("\n")}`);
});

test("working controls resolve to black rather than a flat pink face", () => {
  const interfaceCss = readFileSync(new URL("interface-v2.css", dir), "utf8");
  const managementCss = readFileSync(new URL("management-aesthetic.css", dir), "utf8");
  const workflowLock = interfaceCss.slice(interfaceCss.indexOf("/* D945"));
  const managementLock = managementCss.slice(managementCss.indexOf("/* D951"));
  assert.match(workflowLock,/\.recipe-card \.recipe-tile \.recipe-use em\{[\s\S]*?background:#0d0b0c!important/);
  assert.match(workflowLock,/\.save-recipe,[\s\S]*?background:#0d0b0c!important/);
  assert.match(managementLock,/\.batch-row-actions button:first-child,[\s\S]*?background:#0d0b0c!important/);
  assert.match(managementLock,/box-shadow:none!important/);
});

test("destructive presses are still red, not repainted pink", () => {
  const clarity = readFileSync(new URL("clarity-pass.css", dir), "utf8");
  assert.match(clarity, /\.confirm-action-go\.destructive\{[^}]*background:#a32c4c/);
});

test("D955: internal workflow actions are flat; only the footer forward action has the pink offset",()=>{
  const css=readFileSync(new URL("interface-v2.css",dir),"utf8");
  const block=css.slice(css.indexOf("/* D945"));
  for(const selector of [
    ".launch-button",".workflow-next",".save-recipe",".publish-all-button",
    ".pricing-approval-button",".actual-cost-review button",".support-chat-form button"
  ]) assert.ok(block.includes(selector),`${selector} must use the shared primary-action treatment`);
  assert.match(block,/background:#0d0b0c!important;\s*color:#fff!important;\s*box-shadow:none!important/);
  assert.match(block,/\.recipe-card \.recipe-tile \.recipe-use em\{[\s\S]*?background:#0d0b0c!important;[\s\S]*?box-shadow:none!important/);
  assert.match(block,/:hover:not\(:disabled\)\{\s*background:#171117!important;\s*box-shadow:none!important;\s*transform:none/);
  assert.match(css,/\.app-shell \.footer-forward-action\{\s*box-shadow:4px 4px 0 var\(--lf-pink\)!important/);
  assert.match(css,/\.blocking-modal \.publish-confirm-actions button,[\s\S]*?box-shadow:none!important/);
});

test("D945: disabled actions remain visibly disabled instead of hot pink",()=>{
  const css=readFileSync(new URL("interface-v2.css",dir),"utf8");
  const block=css.slice(css.indexOf("/* D945"));
  assert.match(block,/:disabled\{[\s\S]*?background:#eee9ec!important;[\s\S]*?color:#9b8e96!important;[\s\S]*?box-shadow:4px 4px 0 #f2dce9!important/);
});
