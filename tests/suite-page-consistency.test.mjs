import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const research=readFileSync("app/market-watch/research/research.css","utf8");
const watch=readFileSync("app/market-watch/market-watch.css","utf8");
const hot=readFileSync("app/hot-list/hot-list.css","utf8");
const trademark=readFileSync("app/trademark/trademark.css","utf8");
const trademarkPage=readFileSync("app/trademark/page.tsx","utf8");
const updates=readFileSync("app/platform-updates.css","utf8");
const updatesPage=readFileSync("app/platform-updates/update-view.tsx","utf8");
const watchPage=readFileSync("app/market-watch/market-watch-client.tsx","utf8");

test("suite interior navigation uses the centered rail treatment",()=>{
  for(const source of [research,watch,updates,hot]){
    assert.match(source,/width:max-content!important/);
    assert.match(source,/border-radius:999px!important/);
    assert.match(source,/box-shadow:3px 3px 0/);
  }
});

test("Hot List inherits the suite typeface",()=>{
  assert.doesNotMatch(hot,/Plus Jakarta Sans|fonts\.googleapis\.com/);
  assert.match(hot,/font-family:inherit/);
});

test("tracked keyword and shop cards expose their existing evidence",()=>{
  assert.match(watchPage,/current-watch-metrics/);
  assert.match(watchPage,/Selling listings/);
  assert.match(watchPage,/Repeat-selling listings/);
  assert.match(watchPage,/Listings to review/);
  assert.match(watchPage,/Buyer feedback/);
});

test("Trademark Check makes the checker primary and shows watch count",()=>{
  assert.match(trademark,/Make the checker itself the primary surface/);
  assert.match(trademark,/\.tm-page \.tm-form\{[\s\S]*border:2px solid #000/);
  assert.match(trademarkPage,/Watched phrases <span>\{watches\.length\}<\/span>/);
});

test("platform updates page names both platforms explicitly",()=>{
  assert.match(updatesPage,/Etsy \+ Printify updates/);
});
