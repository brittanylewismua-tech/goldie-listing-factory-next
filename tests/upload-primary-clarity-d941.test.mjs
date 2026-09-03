import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const app=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const css=await readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D949: the main uploader cannot be mistaken for a front-and-back pair",()=>{
  assert.match(app,/activeBundle&&bundleRecipes\.length>1\?`Upload each \$\{uploadPrimaryLabel\} design once\. Goldie uses it on every product in this bundle\.`:`Upload one \$\{uploadPrimaryLabel\} design per listing\.`/);
  assert.match(app,/uploadSecondaryLabel\?` Add optional \$\{uploadSecondaryLabel\} artwork afterward\.`/);
  assert.doesNotMatch(app,/upload-primary-note[^\n]*\bback\b/i);
  assert.match(app,/secondarySides=sides\.filter\(side=>side!==primarySide\)/);
  assert.match(app,/secondarySides\.map\(side=><label/);
  assert.match(app,/: "Add a folder"/);
  assert.match(app,/>Add individual images</);
});

test("D942: side names come only from the selected Printify template",()=>{
  assert.match(app,/uploadPrintSides=orderedPrintSides\(templateDetails\?\.printPositions\)/);
  assert.match(app,/uploadPrimarySide=primaryPrintSide\(uploadPrintSides\)/);
  assert.match(app,/uploadSecondaryLabels=uploadPrintSides\.filter\(side=>side!==uploadPrimarySide\)/);
  assert.match(app,/secondarySides\.map\(side=>[\s\S]{0,500}Add \{printSideLabel\(side\)\.toLocaleLowerCase\(\)\} artwork to this design/);
});

test("D949: upload guidance is quiet and separated from the controls",()=>{
  assert.match(css,/\.file-reminder\.upload-guidance\{[^}]*justify-content:center/);
  assert.match(css,/\.file-reminder\.upload-guidance\{[^}]*margin:0 auto 18px!important/);
  assert.match(css,/\.file-reminder\.upload-guidance\{[^}]*text-align:center/);
  assert.match(css,/\.upload-primary-note\{[^}]*display:block;[^}]*margin:0 0 18px/);
});
