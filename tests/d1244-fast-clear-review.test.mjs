import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {actualCostReview} from '../app/draft-pricing.ts';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('D1244: unchanged finished costs and prices keep the seller\'s prior approval',()=>{
  const variants=[
    {id:101,cost:1250,price:2600,isEnabled:true},
    {id:102,cost:1450,price:2800,isEnabled:true},
    {id:103,cost:0,price:0,isEnabled:false},
  ];
  assert.equal(actualCostReview(variants,{101:1250,102:1450},{101:2600,102:2800}).approved,true);
  assert.equal(actualCostReview(variants,{101:1251,102:1450},{101:2600,102:2800}).approved,false,'a changed cost must still be reviewed');
  assert.equal(actualCostReview(variants,{101:1250,102:1450},{101:2601,102:2800}).approved,false,'a changed price must still be reviewed');
  assert.equal(actualCostReview(variants).approved,false,'old requests without comparison evidence stay unapproved');
});

test('D1244: creation sends both sides of the price comparison and never waits on browser cache after Printify',()=>{
  const app=read('app/listing-factory-app.tsx');
  const worker=read('app/api/printify/drafts/execute-job.ts');
  assert.match(app,/variantCosts:Object\.fromEntries\(requestPricedVariants\.map\(variant=>\[String\(variant\.id\),variant\.cost\]\)\)/);
  assert.match(worker,/actualCostReview\(costVariants,body\.variantCosts,body\.variantPrices\)/);
  assert.match(app,/void Promise\.allSettled\(cacheWrites\);\s*await providerCompletion/);
  assert.doesNotMatch(app,/Promise\.all\(\[providerCompletion,Promise\.all\(cacheWrites\)\]\)/);
  assert.match(app,/pricingApproved:finished\?finalPricingApproved:false/);
});

test('Every final price blocker has a correction link on Photos',()=>{
  const app=read('app/listing-factory-app.tsx');
  assert.match(app,/target\.phase==="pricing"\)\{setActiveTask\("draft-pricing"\);goToStep\("designs",false,true\)\}/);
  assert.match(app,/const next=unfinishedDraftGuidance\(\)/);
  assert.match(app,/onClick=\{\(\)=>openGuidedDraftTask\(next.task,next.index\)\}/);
  assert.match(app,/disabled=\{imagesStepIssues\(\).length>0\}/);
});

test('D1244: returning from sign-in retries the preserved save',()=>{
  const app=read('app/listing-factory-app.tsx');
  assert.match(app,/if\(!batchAuthenticationRequired\)return;[\s\S]*window\.addEventListener\("focus",retry\)/);
  assert.match(app,/Saving will retry automatically\./);
});
