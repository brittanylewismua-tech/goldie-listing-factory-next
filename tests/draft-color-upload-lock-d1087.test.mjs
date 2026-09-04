import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const selector=app.slice(app.indexOf("function DraftColorSelector"),app.indexOf("function ProductSizeSelector"));

test("D1090: upload and Preview follow the last clicked color, never a crossed swatch",()=>{
  assert.match(selector,/const artworkUploadColor=useRef<ProductColor\|null>\(null\)/);
  assert.match(selector,/const explicitlyChosenColor=useRef<ProductColor\|null>/);
  assert.match(selector,/explicitlyChosenColor\.current=color/);
  assert.match(selector,/artworkUploadColor\.current=explicitlyChosenColor\.current\|\|focused/);
  assert.match(selector,/const focused=artworkUploadColor\.current\|\|explicitlyChosenColor\.current\|\|colors\.find/);
  assert.match(selector,/function focusColor\(id:number\)\{if\(artworkUploadColor\.current\)return;/);
  assert.match(selector,/function toggle\(color:ProductColor\)\{artworkUploadColor\.current=null;/);
});
