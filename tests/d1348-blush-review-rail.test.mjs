import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const cssUrl=new URL("../app/interface-v2.css",import.meta.url);

test("D1348: the editing rail is pale blush glass with a firm boundary",async()=>{
  const css=await readFile(cssUrl,"utf8");
  assert.match(css,/\.review-listing-editor-nav\{[^}]*border:2px solid #171417[^}]*background:rgba\(255,244,250,\.84\)[^}]*color:#2d2229[^}]*box-shadow:4px 4px 0 #171417[^}]*backdrop-filter:blur\(16px\) saturate\(115%\)/);
  assert.match(css,/\.review-section-switcher button\{[^}]*background:rgba\(255,255,255,\.56\)[^}]*color:#2d2229/);
  assert.match(css,/\.review-section-switcher button\[aria-current="page"\]\{[^}]*border-color:#ff39ad[^}]*background:#171417[^}]*color:#fff/);
});

test("D1348: status marks stay readable on the active dark destination",async()=>{
  const css=await readFile(cssUrl,"utf8");
  assert.match(css,/button\[aria-current="page"\] \.review-section-state\.is-done\{border-color:#6fbd8e;background:rgba\(83,189,124,\.1\);color:#6fce96\}/);
  assert.match(css,/button\[aria-current="page"\] \.review-section-state\.is-incomplete\{border-color:#df7d86;background:rgba\(240,106,106,\.1\);color:#ef8a92\}/);
});
