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

test("D984 sends the broad preview set but keeps the seller selection separate",()=>{
  const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
  const route=fs.readFileSync(new URL("../app/api/printify/drafts/route.ts",import.meta.url),"utf8");
  assert.match(app,/mockupVariantIds:mockupVariants\.map\(variant=>variant\.id\)/);
  assert.match(app,/requestSizes\.slice\(0,1\)/);
  assert.match(app,/const mockupVariants=variantsFor[\s\S]{0,900}const variants=mockupVariants;[\s\S]{0,900}artworkAssignments=/);
  assert.match(route,/const enabledForCreation=finalVariantIds/);
  assert.match(route,/exactMockupCoverageComplete\(chunkImages,chunk\)/);
  assert.match(route,/restoredVariants\(resolvedProduct\.variants\|\|template\.variants,finalVariantIds\)/);
  assert.match(route,/previewVariantChunks\(previewVariantIds\)/);
  assert.match(route,/exactMockupCoverageComplete\(chunkImages,chunk\)/);
  assert.match(route,/body:\(\)=>productBody\(chunk,true\)/);
  assert.match(route,/previewProduct\?\.id[\s\S]{0,260}method:"DELETE"/);
  assert.match(route,/catch\(error\)[\s\S]{0,350}method:"DELETE"/);
  assert.match(route,/No draft was kept; try again/);
});

test("D992 keeps helper color previews out of the listing-photo collection",()=>{
  const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
  const route=fs.readFileSync(new URL("../app/api/printify/drafts/route.ts",import.meta.url),"utf8");
  assert.match(route,/let colorPreviewImages=resolvedProduct\.images\|\|\[\]/);
  assert.match(route,/colorPreviewImages=previewImages;\s*resolvedProduct=\{\.\.\.resolvedProduct,variants:/);
  assert.doesNotMatch(route,/resolvedProduct=\{\.\.\.resolvedProduct,images:previewImages/);
  assert.match(route,/printifyImages: productImages\.map/);
  assert.match(route,/colorPreviewImageDetails:colorPreviewImages\.filter/);
  assert.match(app,/draft\.colorPreviewImageDetails\?\.length\?draft\.colorPreviewImageDetails:draft\.printifyImageDetails/);
});

test("D993 generates every missing color window concurrently",()=>{
  const route=fs.readFileSync(new URL("../app/api/printify/drafts/route.ts",import.meta.url),"utf8");
  assert.match(route,/const missingChunks=previewVariantChunks\(previewVariantIds\)\.filter/);
  assert.match(route,/await Promise\.all\(missingChunks\.map\(async chunk=>/);
  assert.doesNotMatch(route,/for\(const chunk of previewVariantChunks\(previewVariantIds\)\)/);
  assert.match(route,/mergeMockupImages\(colorPreviewImages,\.\.\.generatedWindows\)/);
});
