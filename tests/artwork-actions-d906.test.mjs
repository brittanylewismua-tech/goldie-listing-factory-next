import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D906: no pre-draft control pretends it can change product colors",()=>{
  assert.doesNotMatch(app,/>Change product colors<\/button>/);
  assert.doesNotMatch(app,/batch-preferences-after-designs.*scrollIntoView/);
});

test("D906: the alternate-artwork action says exactly what it does",()=>{
  assert.match(app,/Use a different design on some colors/);
  assert.match(app,/addArtworkVersion\(file\.id,primarySide,event\.target\.files\)/);
  assert.doesNotMatch(app,/Add another front colorway/);
});

test("D906: actual color changes stay on the post-draft control with real previews",()=>{
  assert.match(app,/function DraftColorSelector/);
  assert.match(app,/REAL PRINTIFY PREVIEW/);
  assert.match(app,/task==="draft-colors"/);
  assert.match(app,/syncDraftVariantChoices\(ids,selectedSizeIds\)/);
});
