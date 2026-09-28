import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page=readFileSync("app/trademark/page.tsx","utf8");
const css=readFileSync("app/trademark/trademark.css","utf8");

test("Trademark results lead with a concise factual summary",()=>{
  assert.match(page,/const summaryTitle = verdict\.registerRead === false/);
  assert.match(page,/No phrase match found in this search/);
  assert.match(page,/className="tm-result-summary"/);
  assert.match(page,/Phrase matches/);
  assert.match(page,/Word matches/);
  assert.match(page,/Brand \/ character flags/);
  assert.doesNotMatch(page,/safe to use|this phrase is safe/i);
});

test("Trademark summary is responsive and visually distinct",()=>{
  assert.match(css,/\.tm-result-summary\{/);
  assert.match(css,/grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(css,/@media\(max-width:760px\)/);
});
