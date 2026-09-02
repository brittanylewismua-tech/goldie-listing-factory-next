import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const app=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const css=await readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D942: the main uploader cannot be mistaken for a front-and-back pair",()=>{
  assert.match(app,/Main upload: one \{uploadPrimaryLabel\} design creates one listing/);
  assert.match(app,/This product also supports \$\{uploadSecondaryLabel\} artwork/);
  assert.match(app,/after the \$\{uploadPrimaryLabel\} design appears below/);
  assert.doesNotMatch(app,/upload-primary-note[^\n]*\bback\b/i);
  assert.match(app,/secondarySides=sides\.filter\(side=>side!==primarySide\)/);
  assert.match(app,/secondarySides\.map\(side=><label/);
  assert.match(app,/Choose a folder of \$\{uploadPrimaryLabel\} designs/);
  assert.match(app,/Choose \{uploadPrimaryLabel\} design images/);
  assert.match(app,/Each image creates one listing/);
});

test("D942: side names come only from the selected Printify template",()=>{
  assert.match(app,/uploadPrintSides=orderedPrintSides\(templateDetails\?\.printPositions\)/);
  assert.match(app,/uploadPrimarySide=primaryPrintSide\(uploadPrintSides\)/);
  assert.match(app,/uploadSecondaryLabels=uploadPrintSides\.filter\(side=>side!==uploadPrimarySide\)/);
  assert.match(app,/secondarySides\.map\(side=>[\s\S]{0,500}Add \{printSideLabel\(side\)\.toLocaleLowerCase\(\)\} artwork to this design/);
});

test("D942: upload guidance is centered and separated from the controls",()=>{
  assert.match(css,/\.file-reminder\.upload-guidance\{[^}]*justify-content:center/);
  assert.match(css,/\.file-reminder\.upload-guidance\{[^}]*margin:0 auto 22px!important/);
  assert.match(css,/\.file-reminder\.upload-guidance\{[^}]*text-align:center/);
  assert.match(css,/\.upload-primary-note\{[^}]*width:min\(100%,760px\);margin:0 auto 14px/);
});
