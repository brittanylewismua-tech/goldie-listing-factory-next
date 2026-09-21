import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");
const rendering=fs.readFileSync(new URL("../app/product-color-rendering.tsx",import.meta.url),"utf8");
test('an absent artwork image cannot be dereferenced while a rendering loads',()=>{
  assert.match(rendering,/area&&placement&&image&&image\.url===artworkUrl/);
  assert.doesNotMatch(rendering,/image\?\.url===artworkUrl\?artworkInRendering/);
});

test("Color browsing uses available real mockups with an explicit edit view",()=>{
  assert.match(app,/showRealPreview&&realPreview\?<img/);
  assert.match(app,/Back to edit view":previewLoading\?"Loading preview…":"Preview"/);
  assert.doesNotMatch(app,/Printify preview loading/);
});

test("Color browsing selects an existing preview without a provider write",()=>{
  const focus=app.match(/function focusColor\(id:number\)\{([^\n]*)\}/)[1];
  assert.match(focus,/setActiveColor\(id\);setShowRealPreview\(true\)/);
  assert.doesNotMatch(focus,/onChange|fetch\(/);
  assert.match(app,/explicitlyChosenColor\.current=color/);
  assert.doesNotMatch(app,/onMouseEnter=\{[^}]*onChange/);
});

test("The edit view uses actual rendering and print-area placement",()=>{
  assert.match(rendering,/function ProductColorRendering/);
  assert.match(rendering,/className="product-color-rendering-base" src=\{productRenderingUrl\}/);
  assert.match(rendering,/<image href=\{artworkUrl\} x=\{art.x\}/);
  assert.match(app,/placement=\{draft.placement\} side=\{renderingSide\}/);
  assert.match(app,/draft\.artworkPreviewUrls\?\.primary/);
  assert.match(app,/const artworkPreviewUrl=file\?URL\.createObjectURL\(file\):""/);
  assert.doesNotMatch(css,/\.product-color-rendering-art\{/);
  assert.match(rendering,/clipPath/);
});
