import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files=[
  "app/market-watch/research/research.css",
  "app/market-watch/market-watch.css",
  "app/hot-list/hot-list.css",
  "app/trademark/trademark.css",
  "app/shop-map/shop-map.css",
  "app/connections/connections.css",
];

test("suite pages do not force inherit with !important",()=>{
  for(const file of files){
    const css=readFileSync(file,"utf8");
    assert.doesNotMatch(css,/font-family\s*:\s*inherit\s*!important/i,file);
  }
});

test("suite navigation and compact action controls keep 40px touch targets",()=>{
  const research=readFileSync("app/market-watch/research/research.css","utf8");
  const hot=readFileSync("app/hot-list/hot-list.css","utf8");
  const tm=readFileSync("app/trademark/trademark.css","utf8");
  const shop=readFileSync("app/shop-map/shop-map.css","utf8");
  for(const css of [research,hot,tm,shop]){
    assert.doesNotMatch(css,/min-height:(?:30|32|34|38)px!important/);
  }
});
