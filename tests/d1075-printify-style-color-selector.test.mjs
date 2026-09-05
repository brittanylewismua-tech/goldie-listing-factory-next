import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../app/interface-v2.css",import.meta.url),"utf8");
const rendering=fs.readFileSync(new URL("../app/product-color-rendering.tsx",import.meta.url),"utf8");

test("D1075 color browsing never mounts a Printify mockup automatically",()=>{
  assert.match(app,/showRealPreview&&realPreview\?<img/);
  assert.match(app,/Back to edit view":previewLoading\?"Loading preview…":"Preview"/);
  assert.doesNotMatch(app,/Printify preview loading/);
});

test("Color browsing changes only the local illustration, never saves",()=>{
  const focus=app.match(/function focusColor\(id:number\)\{([^\n]*)\}/)[1];
  assert.match(focus,/setActiveColor\(id\);setShowRealPreview\(false\)/);
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
