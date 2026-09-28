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

test("Daily Updates uses shop research and Hot List, not trademark or vague movement copy",()=>{
  const daily=home.slice(home.indexOf("const daily=["),home.indexOf("const up=updates"));
  assert.match(daily,/tag:"YOUR SHOP"/);
  assert.match(daily,/tag:"RESEARCH"/);
  assert.match(daily,/tag:"HOT LIST"/);
  assert.doesNotMatch(daily,/TRADEMARK|moved again|showing momentum/);
  assert.match(daily,/started selling since your last check/);
});

test("Research Daily Update does not borrow an image from the member's Shop Stats",()=>{
  const daily=home.slice(home.indexOf("const daily=["),home.indexOf("const up=updates"));
  const research=daily.slice(daily.indexOf('tag:"RESEARCH"'),daily.indexOf('tag:"HOT LIST"'));
  assert.match(research,/image:null/);
  assert.doesNotMatch(research,/listings\[[0-9]+\]\?\.imageUrl/);
});

test("Home keeps the highest-priority platform update first and includes the other platform when available",()=>{
  assert.match(home,/const leadPlatform=allPlatform\[0\]/);
  assert.match(home,/find\(item=>item\.platform!==leadPlatform\.platform\)/);
  assert.match(home,/\.slice\(0,4\)/);
});

test("Home platform headlines have distinct card treatment",()=>{
  assert.match(css,/\.home4-headlines a\{[^}]*border:1\.5px solid #000[^}]*box-shadow:3px 3px 0 var\(--pink\)/);
});

test("official Help Center article images can flow into platform update items",()=>{
  assert.match(collector,/source\.kind==='article'\?articleImage\(body,source\.platform\)/);
});
