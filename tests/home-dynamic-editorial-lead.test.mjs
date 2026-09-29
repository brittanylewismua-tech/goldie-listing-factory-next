import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const home=readFileSync("app/home-preview/preview-client.tsx","utf8");
const css=readFileSync("app/home-preview/preview.css","utf8");

test("Home gives the launcher the hero position without decorative background art",()=>{
  assert.doesNotMatch(home,/Good morning|Good afternoon|Good evening|Your command center/);
  assert.doesNotMatch(home,/goldie-background-g/);
  assert.doesNotMatch(css,/\.goldie-background-g\{/);
});

test("the member's Orbit or Line choice survives leaving Home",()=>{
  assert.match(home,/localStorage\.getItem\("goldie-home-layout"\)/);
  assert.match(home,/localStorage\.setItem\("goldie-home-layout",next\)/);
  assert.match(home,/layout==="orbit"/);
  assert.match(home,/layout==="line"/);
});

test("Home uses the established suite logo treatment",()=>{
  assert.match(home,/<SuiteBrand current\/>/);
  assert.match(css,/\.goldie-home-brand \.suite-brand-mark\.suite-brand-g\.current-wordmark/);
  assert.match(css,/font-family:Georgia,'Times New Roman',serif!important/);
});

test("the update section header is anchored to the cards",()=>{
  assert.match(css,/\.goldie-updates-head\{[^}]*border-bottom:2px solid #000[^}]*margin-bottom:18px/);
  assert.match(css,/\.goldie-updates-head h2\{[^}]*color:#fff!important[^}]*text-shadow:3px 3px 0 #000/);
});
