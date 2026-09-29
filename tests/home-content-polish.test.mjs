import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page=readFileSync("app/home/page.tsx","utf8");
const home=readFileSync("app/home-preview/preview-client.tsx","utf8");
const css=readFileSync("app/home-preview/preview.css","utf8");
const collector=readFileSync("app/platform-update-collector.ts","utf8");

test("Home greeting is server-fed and does not derive from the shop name",()=>{
  assert.match(page,/HomeView firstName=\{firstName\}/);
  assert.match(home,/firstName\?", "\+firstName/);
  assert.doesNotMatch(home,/account\?\.name|account\?\.firstName/);
});

test("Home is the Goldie Suite launcher, not the retired dashboard",()=>{
  for(const label of ["Your Shop","Listing Factory","Market Radar","MirrorBot","Trademark Check"]) assert.ok(home.includes(label),label);
  assert.match(home,/goldie-home-layout/);
  assert.match(home,/goldie-orbit-layer/);
  assert.match(home,/goldie-line-view/);
  assert.doesNotMatch(home,/Daily updates|What sold overnight|Pick up where you left off/);
});

test("Orbit cards stay upright and the orbit uses the approved pace",()=>{
  assert.match(home,/delta\*360\/600000/);
  assert.match(home,/-base-angle/);
  assert.match(css,/\.goldie-orbit-ring circle\{[^}]*stroke:var\(--grey\)[^}]*stroke-width:1\.5/);
});

test("Etsy and Printify updates keep the approved two-panel treatment",()=>{
  assert.match(home,/platform==="Etsy"/);
  assert.match(home,/platform==="Printify"/);
  assert.match(css,/\.goldie-platform-grid\{display:grid;grid-template-columns:1fr 1fr/);
  assert.match(css,/\.goldie-platform-panel\{[^}]*border:2px solid #000[^}]*box-shadow:5px 5px 0 #000/);
  assert.match(css,/\.goldie-updates-head\{[^}]*border-bottom:2px solid #000/);
  assert.ok(home.includes("See all ${title} updates →"));
  assert.match(css,/\.goldie-platform-panel>header\{[^}]*justify-content:space-between/);
  assert.match(css,/\.goldie-platform-panel>header>a\{[^}]*text-transform:uppercase/);
});

test("official Help Center article images can flow into platform update items",()=>{
  assert.match(collector,/source\.kind===\'article\'\?articleImage\(body,source\.platform\)/);
});
