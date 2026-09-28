import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page=readFileSync("app/market-watch/research/research-client.tsx","utf8");
const css=readFileSync("app/market-watch/research/research.css","utf8");

test("Research keeps daily-change sections open and deep dives collapsed",()=>{
  assert.match(page,/<details open className="nr-secondary-section"><summary>New products & buyer reviews</summary>/);
  assert.match(page,/<details open className="nr-secondary-section"><summary>Changes since the previous check</summary>/);
  assert.match(page,/<details className="nr-secondary-section"><summary>Phrases appearing across shops</summary>/);
  assert.match(page,/<details className="nr-secondary-section"><summary>Product breakdown</summary>/);
  assert.match(page,/<details className="nr-secondary-section"><summary>Explore wording used in listing titles</summary>/);
});

test("Research deep dives have an explicit disclosure affordance",()=>{
  assert.match(css,/\.nr-secondary-section>summary::after/);
  assert.match(css,/\.nr-secondary-section:not\(\[open\]\)>summary::after/);
});
