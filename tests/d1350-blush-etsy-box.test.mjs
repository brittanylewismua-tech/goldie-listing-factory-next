import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("D1350: the Etsy handoff box uses the pale-blush glass system",async()=>{
  const css=await readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8");
  assert.match(css,/\.factory-publish-box\{[\s\S]*?background:rgba\(255,244,250,\.84\);color:#2d2229;[\s\S]*?backdrop-filter:blur\(16px\) saturate\(115%\)/);
  assert.match(css,/\.review-etsy-draft-button\{[\s\S]*?background:#171417;color:#fff;box-shadow:4px 4px 0 var\(--g-pink\)/);
  assert.match(css,/\.review-printify-link\{border-top-color:rgba\(23,20,23,\.18\);color:#2d2229\}/);
  assert.match(css,/\.factory-publish-box \.etsy-transfer-track\{border-color:#cbbdc5;background:#e8e0e5\}/);
});

test("D1350: completed Etsy progress uses the refined line check",async()=>{
  const [component,css]=await Promise.all([
    readFile(new URL("../app/photo-delivery-handoff.tsx",import.meta.url),"utf8"),
    readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8")
  ]);
  assert.match(component,/done\?<svg viewBox="0 0 16 16"/);
  assert.doesNotMatch(component,/done\?'✓':''/);
  assert.match(css,/\.etsy-transfer-spinner svg\{[^}]*stroke-width:2[^}]*stroke-linecap:round/);
  assert.match(css,/\.etsy-transfer-progress\.is-complete \.etsy-transfer-spinner\{border:1px solid #90c8a7;color:#3f8a62\}/);
  assert.match(css,/\.etsy-transfer-progress\.is-complete \.etsy-transfer-spinner\{background:#f2faf5\}/);
});
