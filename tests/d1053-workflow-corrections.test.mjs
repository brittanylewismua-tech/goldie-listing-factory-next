import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("D1053: post-draft colors have the same bulk actions as sizes",async()=>{
  const app=await read("app/listing-factory-app.tsx");
  const block=app.slice(app.indexOf("function DraftColorSelector"),app.indexOf("function ProductSizeSelector"));
  for(const label of ["Select all available","Match Printify template","Clear all"])assert.match(block,new RegExp(label));
});

test("D1053: opening listing photos refreshes every Printify-generated mockup",async()=>{
  const [app,route]=await Promise.all([read("app/listing-factory-app.tsx"),read("app/api/printify/drafts/update/route.ts")]);
  assert.match(app,/onRefresh=\{draft\.id\?\(\)=>refreshDraftPhotos/);
  assert.match(route,/refreshImages\?:boolean/);
  assert.match(route,/body\.refreshImages/);
});

test("D1053: photo ordering works in both directions and persists the live order",async()=>{
  const order=await read("app/listing-photo-order.tsx");
  assert.match(order,/nudge\(id,-1\)/);
  assert.match(order,/nudge\(id,1\)/);
  assert.match(order,/orderRef\.current=current;setOrder\(current\);void save\(current\)/);
  assert.match(order,/setData\("text\/plain",id\)/);
});

test("D1053: per-listing descriptions are intentionally collapsed",async()=>{
  const app=await read("app/listing-factory-app.tsx");
  assert.match(app,/details className="individual-description-disclosure"/);
  assert.match(app,/summary>Description for this listing<\/summary>/);
});

test("D1054: Step 3 identifies the listing with its Printify product mockup",async()=>{
  const app=await read("app/listing-factory-app.tsx");
  assert.match(app,/drafts\.find\(draft=>draft\.clientId===design\.id\)\?\.previewUrl/);
  assert.match(app,/className="listing-product-preview"/);
});

test("D1055: the rendered shipping combobox stays white and readable",async()=>{
  const css=await read("app/interface-v2.css");
  assert.match(css,/\.shipping-combobox-option\{/);
  assert.match(css,/\.shipping-combobox-option:hover/);
  assert.match(css,/\.shipping-combobox-option\[aria-selected="true"\]/);
  const block=css.slice(css.lastIndexOf(".shipping-combobox-panel"));
  assert.match(block,/background:#fff!important/);
  assert.match(block,/color:#211a1f!important/);
});
