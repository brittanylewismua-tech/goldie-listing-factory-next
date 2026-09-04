import test from "node:test";
import assert from "node:assert/strict";
import {creationVariantIds,exactMockupCoverageComplete,expandPrintAreasForPreview,mergeMockupImages,mockupCoverageComplete,PREVIEW_MOCKUP_WAITS_MS,previewVariantChunks,restoredVariants} from "../app/draft-preview-variants.ts";
import fs from "node:fs";

test("D984 creates real previews broadly and restores the paid draft choices",()=>{
  assert.deepEqual(creationVariantIds([11,12],[11,12,21,22]),[11,12,21,22]);
  assert.deepEqual(creationVariantIds([11,12],[21,22]),[11,12,21,22]);
  assert.deepEqual(restoredVariants([{id:11},{id:12},{id:21}],[11,12]),[
    {id:11,is_enabled:true},{id:12,is_enabled:true},{id:21,is_enabled:false},
  ]);
});

test("D987 never asks Printify to enable more than 100 variants",()=>{
  const selected=Array.from({length:21},(_,index)=>index+1);
  const previews=Array.from({length:120},(_,index)=>index+20);
  const enabled=creationVariantIds(selected,previews);
  assert.equal(enabled.length,100);
  assert.deepEqual(enabled.slice(0,21),selected);
});

test("D985 expands each print area with preview variants that share its selected source",()=>{
  assert.deepEqual(expandPrintAreasForPreview([
    {variant_ids:[11,12],placeholders:[{position:"front"}]},
  ],{21:11,22:12}),[
    {variant_ids:[11,12,21,22],placeholders:[{position:"front"}]},
  ]);
});

test("D984 refuses to call color previews complete until every requested variant is pictured",()=>{
  assert.equal(mockupCoverageComplete([{variant_ids:[11,12]},{variant_ids:[21,22]}],[11,12,21,22]),true);
  assert.equal(mockupCoverageComplete([{variant_ids:[11,12]}],[11,12,21,22]),false);
});

test("D988 rotates through Printify's twenty-image mockup window",()=>{
  assert.deepEqual(previewVariantChunks(Array.from({length:39},(_,index)=>index+1)),[
    Array.from({length:20},(_,index)=>index+1),
    Array.from({length:19},(_,index)=>index+21),
  ]);
  const first=[{src:"https://images.printify.com/mockup/p/11/front.jpg",variant_ids:[11,12]}];
  const second=[{src:"https://images.printify.com/mockup/p/12/front.jpg",variant_ids:[11,12]}];
  assert.equal(exactMockupCoverageComplete(first,[11]),true);
  assert.equal(exactMockupCoverageComplete(first,[11,12]),false);
  assert.deepEqual(mergeMockupImages(first,first,second),[first[0],second[0]]);
});

test("D989 keeps each asynchronous Printify mockup window bounded",()=>{
  assert.deepEqual(PREVIEW_MOCKUP_WAITS_MS,[1000,1500,2500,4000,7000]);
  assert.equal(PREVIEW_MOCKUP_WAITS_MS.reduce((sum,wait)=>sum+wait,0),16000);
});

test("D1045 generates previews on the real draft and restores the seller selection",()=>{
  const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
  const route=fs.readFileSync(new URL("../app/api/printify/drafts/route.ts",import.meta.url),"utf8");
  assert.match(app,/mockupVariantIds:mockupVariants\.map\(variant=>variant\.id\)/);
  assert.match(app,/requestSizes\.slice\(0,1\)/);
  assert.match(app,/const mockupVariants=variantsFor[\s\S]{0,900}const variants=mockupVariants;[\s\S]{0,900}artworkAssignments=/);
  assert.match(route,/const enabledForCreation=creationVariantIds\(finalVariantIds,previewVariantIds\)/);
  assert.match(route,/restoredVariants\(resolvedProduct\.variants\|\|template\.variants,finalVariantIds\)/);
  assert.doesNotMatch(route,/previewProduct|productBody\(chunk,true\)/);
  assert.doesNotMatch(route,/catch\(error\)[\s\S]{0,350}method:"DELETE"/);
});

test("D1051 returns creation without polling for delayed color previews",()=>{
  const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
  const route=fs.readFileSync(new URL("../app/api/printify/drafts/route.ts",import.meta.url),"utf8");
  assert.match(route,/let colorPreviewImages=resolvedProduct\.images\|\|\[\]/);
  assert.doesNotMatch(route,/PREVIEW_MOCKUP_WAITS_MS\.slice/);
  assert.doesNotMatch(route,/for\(const wait of PREVIEW_MOCKUP_WAITS_MS/);
  assert.match(route,/printifyImages: productImages\.map/);
  assert.match(route,/colorPreviewImageDetails:colorPreviewImages\.filter/);
  assert.match(app,/draft\.colorPreviewImageDetails\?\.length\?draft\.colorPreviewImageDetails:draft\.printifyImageDetails/);
});

test("D1051 never blocks creation on preview refreshes and never deletes a created draft",()=>{
  const route=fs.readFileSync(new URL("../app/api/printify/drafts/route.ts",import.meta.url),"utf8");
  assert.match(route,/Never hold the creation screen open waiting for asynchronously/);
  assert.match(route,/signal: AbortSignal\.timeout\(30000\)/);
  assert.match(route,/A late mockup refresh must never turn that success/);
  assert.doesNotMatch(route,/DELETE[^]{0,180}created\.id/);
});
