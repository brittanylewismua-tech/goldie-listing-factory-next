import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D1075 color browsing never mounts a Printify mockup automatically",()=>{
  assert.match(app,/showRealPreview&&realPreview\?<img/);
  assert.match(app,/Back to edit view":"Preview"/);
  assert.doesNotMatch(app,/Printify preview loading/);
});

test("D1075 hover only changes the local illustrated color",()=>{
  assert.match(app,/function focusColor\(id:number\)\{setActiveColor\(id\);setShowRealPreview\(false\)\}/);
  assert.match(app,/onMouseEnter=\{\(\)=>focusColor\(color\.id\)\}/);
  assert.doesNotMatch(app,/onMouseEnter=\{[^}]*onChange/);
});

test("D1077 the edit view composites the uploaded design onto a detailed color rendering",()=>{
  assert.match(app,/function ProductColorRendering/);
  assert.match(app,/className="product-color-rendering-art" src=\{artworkUrl\}/);
  assert.match(app,/artworkByDraft=\{Object\.fromEntries\(files\.map\(file=>\[file\.id,file\.artworkPreviewUrl\|\|""\]\)\)\}/);
  assert.match(app,/const artworkPreviewUrl=file\?URL\.createObjectURL\(file\):""/);
  assert.match(css,/\.product-color-rendering-art\{[^}]*position:absolute!important;[^}]*width:29%!important/);
});
