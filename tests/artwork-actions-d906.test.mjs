import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D906: no pre-draft control pretends it can change product colors",()=>{
  assert.doesNotMatch(app,/>Change product colors<\/button>/);
  assert.doesNotMatch(app,/batch-preferences-after-designs.*scrollIntoView/);
});

test("D906: the alternate-artwork action says exactly what it does",()=>{
  assert.match(app,/Use different artwork for \$\{focused\.title\}/);
  assert.match(app,/onArtworkChange\(draft,focused,event\.target\.files\)/);
  assert.doesNotMatch(app,/>＋ Use different artwork on some colors/);
  assert.doesNotMatch(app,/Add another front colorway/);
});

test("D906: actual color changes stay on the post-draft control with real previews",()=>{
  assert.match(app,/function DraftColorSelector/);
  assert.match(app,/Choose product colors/);
  assert.match(app,/task==="draft-colors"/);
  assert.match(app,/syncDraftVariantChoices\(ids,selectedSizeIds\)/);
  assert.match(app,/updateDraftColorArtwork/);
});

test("D1082: alternate artwork uses the color card's authoritative Printify variants",()=>{
  assert.match(app,/const variantIds=color\.variantIds\?\.length\?\[\.\.\.new Set\(color\.variantIds\.map\(Number\)\)\]:\[\.\.\.printifyVariantIdsForColor/);
  assert.match(app,/Adjust this artwork in Printify ↗/);
});
