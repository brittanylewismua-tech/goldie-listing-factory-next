import test from "node:test";
import assert from "node:assert/strict";
import {creationVariantIds,expandPrintAreasForPreview,mockupCoverageComplete,restoredVariants} from "../app/draft-preview-variants.ts";
import fs from "node:fs";

test("D984 creates real previews broadly and restores the paid draft choices",()=>{
  assert.deepEqual(creationVariantIds([11,12],[11,12,21,22]),[11,12,21,22]);
  assert.deepEqual(creationVariantIds([11,12],[21,22]),[11,12]);
  assert.deepEqual(restoredVariants([{id:11},{id:12},{id:21}],[11,12]),[
    {id:11,is_enabled:true},{id:12,is_enabled:true},{id:21,is_enabled:false},
  ]);
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

test("D984 sends the broad preview set but keeps the seller selection separate",()=>{
  const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
  const route=fs.readFileSync(new URL("../app/api/printify/drafts/route.ts",import.meta.url),"utf8");
  assert.match(app,/mockupVariantIds:mockupVariants\.map\(variant=>variant\.id\)/);
  assert.match(app,/const mockupVariants=variantsFor[\s\S]{0,900}const variants=mockupVariants;[\s\S]{0,900}artworkAssignments=/);
  assert.match(route,/enabledForCreation=creationVariantIds\(finalVariantIds,body\.mockupVariantIds\|\|\[\]\)/);
  assert.match(route,/mockupCoverageComplete\(previewImages,enabledForCreation\)/);
  assert.match(route,/restoredVariants\(resolvedProduct\.variants\|\|template\.variants,finalVariantIds\)/);
  assert.match(route,/method:"DELETE"[\s\S]{0,350}No draft was kept/);
});
