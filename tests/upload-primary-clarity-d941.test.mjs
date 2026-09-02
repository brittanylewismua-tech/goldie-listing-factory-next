import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const app=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const css=await readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D941: the main uploader cannot be mistaken for a front-and-back pair",()=>{
  assert.match(app,/Upload one main design per listing/);
  assert.match(app,/Add alternate-color artwork or artwork for another supported print area to that design card afterward/);
  assert.doesNotMatch(app,/upload-primary-note[^\n]*\bback\b/i);
  assert.match(app,/secondarySides=sides\.filter\(side=>side!==primarySide\)/);
  assert.match(app,/secondarySides\.map\(side=><label/);
  assert.match(app,/Choose a folder of main designs/);
  assert.match(app,/Choose main design images/);
  assert.match(app,/Each image creates one listing/);
});

test("D941: upload guidance is centered and separated from the controls",()=>{
  assert.match(css,/\.file-reminder\.upload-guidance\{[^}]*justify-content:center/);
  assert.match(css,/\.file-reminder\.upload-guidance\{[^}]*margin:0 auto 22px!important/);
  assert.match(css,/\.file-reminder\.upload-guidance\{[^}]*text-align:center/);
});
