import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

test("Back follows the restored listing-details, Etsy-details, photos, final-review sequence",()=>{
  const back=app.slice(app.indexOf("async function goBackOneStep()"),app.indexOf("function canOpenStep"));
  assert.match(back,/progressIndex===6\)return void await enterListingDetails\(\)/);
  assert.match(back,/progressIndex===7\)return openEtsyStage\(\)/);
  assert.match(back,/openPhotoStage\(\)/);
  assert.match(app,/function openPhotoStage\(\)[^]*?goToStep\("designs",false,true\)/);
  assert.match(app,/function openEtsyStage\(\)[^]*?goToStep\("finish",false,true\)/);
});
