import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css=fs.readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D1073 personalization fields use a spaced single-column layout",()=>{
  assert.match(css,/\.personalization-questions article\{[^}]*grid-template-columns:minmax\(0,1fr\)!important[^}]*gap:16px!important[^}]*padding:18px!important/);
  assert.match(css,/\.personalization-questions article>label :is\(input,select,textarea\)\{[^}]*width:100%!important[^}]*box-sizing:border-box/);
});

test("D1073 required-question checkbox cannot stretch into a rectangle",()=>{
  assert.match(css,/\.personalization-required\{[^}]*display:flex!important[^}]*gap:10px!important/);
  assert.match(css,/\.personalization-required input\[type="checkbox"\]\{[^}]*flex:0 0 18px!important[^}]*width:18px!important[^}]*height:18px!important/);
  assert.match(css,/input\[type="checkbox"\]:checked:after\{[^}]*place-items:center/);
});
