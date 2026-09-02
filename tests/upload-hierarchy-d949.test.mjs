import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D949: the upload screen presents one short instruction and compact progress",()=>{
  assert.match(app,/title: "Add your designs", copy: ""/);
  assert.match(app,/Upload one \{uploadPrimaryLabel\} design per listing\./);
  assert.doesNotMatch(app,/Main upload: one/);
  assert.doesNotMatch(app,/listings left on your plan/);
  assert.match(app,/`\$\{files\.length\} design\$\{files\.length===1\?"":"s"\} added`/);
});

test("D949: upload choices read as controls and the work surface separates from the page",()=>{
  assert.match(app,/: "Add a folder"/);
  assert.match(app,/>Add individual images</);
  assert.match(css,/\.designs-step:not\(\.finish-mode\)\{background:#fff!important;border:1px solid #c9b8c2!important/);
  assert.match(css,/\.browse-chip\{[^}]*background:#0d0b0c!important;color:#fff!important;box-shadow:3px 3px 0 #f52fb2!important/);
});
