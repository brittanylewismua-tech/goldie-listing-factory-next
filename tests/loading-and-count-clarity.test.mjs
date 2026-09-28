import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const research=readFileSync("app/market-watch/research/research-client.tsx","utf8");
const trademark=readFileSync("app/trademark/page.tsx","utf8");
const trademarkCss=readFileSync("app/trademark/trademark.css","utf8");
const updates=readFileSync("app/platform-updates/update-view.tsx","utf8");
const updatesCss=readFileSync("app/platform-updates.css","utf8");

test("Research exposes saved niche and listing counts",()=>{
  assert.match(research,/Your niches <span>\{saved\.length\}<\/span>/);
  assert.match(research,/t===\x27listings\x27/);
  assert.match(research,/p\.listings\?\.length\?\?0/);
});

test("Research library has a real loading surface",()=>{
  assert.match(research,/nr-library-loading/);
  assert.match(research,/Loading your research/);
});

test("Trademark shows watched phrases loading before the empty state can be inferred",()=>{
  assert.match(trademark,/watchesLoading/);
  assert.match(trademark,/Loading watched phrases/);
  assert.match(trademarkCss,/\.tm-watches-loading/);
  assert.match(trademarkCss,/\.tm-loader-dot/);
});

test("platform updates shows a self-contained loading surface",()=>{
  assert.match(updates,/pu-loading/);
  assert.match(updates,/Loading platform updates/);
  assert.match(updatesCss,/\.pu-loading/);
  assert.match(updatesCss,/\.pu-loader-dot/);
  assert.doesNotMatch(updates,/home4-loader-dot/);
});
