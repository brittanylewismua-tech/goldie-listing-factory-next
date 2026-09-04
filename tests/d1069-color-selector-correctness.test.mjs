import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const update=fs.readFileSync(new URL("../app/api/printify/drafts/update/route.ts",import.meta.url),"utf8");

test("D1069 never substitutes another color's mockup",()=>{
  assert.doesNotMatch(app,/printifyMockupForColor[\s\S]{0,300}\|\|draft\.previewUrl/);
  assert.doesNotMatch(app,/Printify preview loading/);
  assert.match(app,/color=\{focused\.swatch\}/);
});

test("D1069 clear all updates local selection before validation",()=>{
  const start=app.indexOf("function syncDraftVariantChoices");
  const body=app.slice(start,start+700);
  assert.ok(body.indexOf("setSelectedColorIds(nextColors)")<body.indexOf("if(!selectedVariants.length)"));
  assert.doesNotMatch(app,/if\(next\.size\)\{setActiveColor/);
});

test("D1069 ordinary color changes do not block on mockup polling",()=>{
  assert.match(update,/if\(body\.artworkUpdate\)\{/);
  assert.doesNotMatch(update,/if\(body\.selectedVariantIds\|\|body\.artworkUpdate\)/);
});

test("D1070 updates separate Printify drafts concurrently",()=>{
  const start=app.indexOf("function syncDraftVariantChoices");
  const body=app.slice(start,start+2600);
  assert.match(body,/Promise\.all\(created\.map\(async draft=>/);
  assert.doesNotMatch(body,/for\(const draft of created\)/);
});
