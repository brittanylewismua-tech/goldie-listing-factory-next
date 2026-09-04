import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const selector=app.slice(app.indexOf("function DraftColorSelector"),app.indexOf("function ProductSizeSelector"));

test("D1087: opening an artwork picker locks its exact color against hover drift",()=>{
  assert.match(selector,/const artworkUploadColor=useRef<ProductColor\|null>\(null\)/);
  assert.match(selector,/closest\("\.draft-color-artwork-action"\)\)artworkUploadColor\.current=focused/);
  assert.match(selector,/function focusColor\(id:number\)\{if\(artworkUploadColor\.current\)return;/);
  assert.match(selector,/function toggle\(color:ProductColor\)\{artworkUploadColor\.current=null;/);
});
