import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D1310: combined Etsy readiness includes valid personalization everywhere it is shown",()=>{
  assert.match(app,/export function etsyListingDetailsComplete\(etsy:EtsyDetails\|null\|undefined\):boolean\{\s*return etsyRequiredComplete\(etsy\)&&!personalizationProblem\(etsy\|\|undefined\);\s*\}/);
  assert.match(app,/etsyReadyCount=files\.filter\(file=>etsyListingDetailsComplete\(file\.etsy\)\)\.length/);
  assert.match(app,/label:"Etsy details & personalization",done:etsyListingDetailsComplete\(design\.etsy\)/);
  assert.match(app,/files\.filter\(file=>etsyListingDetailsComplete\(file\.etsy\)\)\.length/);
  assert.match(app,/if\(etsyRequiredComplete\(design\.etsy\)&&!personalization\)return \[\]/);
});

test("D1310: customer-facing status copy refers to The Listing Factory rather than personifying Goldie",()=>{
  const files=[
    ["../app/listing-factory/error.tsx","Goldie kept your saved work safe"],
    ["../app/mobile-gate.tsx","Goldie Listing Factory is built for desktop"],
    ["../app/mockups/occlusion-editor.tsx","Goldie could not find anything crossing"],
    ["../app/operations/operations-control.tsx","when Goldie needs intervention"],
  ];
  for(const [path,forbidden] of files){
    const source=fs.readFileSync(new URL(path,import.meta.url),"utf8");
    assert.doesNotMatch(source,new RegExp(forbidden));
  }
});
