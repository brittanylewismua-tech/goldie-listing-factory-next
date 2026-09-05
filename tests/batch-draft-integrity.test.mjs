import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {navigationIssues,leavingImagesIssues} from '../app/workflow-gates.ts';
import {mergeMatchingDrafts,restoreBatchDrafts,batchDraftIdentityProblem,serializedBatchWrites} from '../app/batch-draft-integrity.ts';
const tee={id:'tee',clientId:'tee-art',batchId:'tee-session',status:'Created',costReview:{required:true,approved:true}};
const hoodie={id:'hoodie',clientId:'hoodie-art',batchId:'hoodie-session',status:'Created',costReview:{required:true,approved:false}};
test('late tee pricing cannot replace the active hoodie results',()=>{
  assert.deepEqual(mergeMatchingDrafts([hoodie],[tee]),[hoodie]);
  assert.deepEqual(mergeMatchingDrafts([hoodie],[{...hoodie,costReview:{required:true,approved:true}}])[0].costReview,{required:true,approved:true});
  assert.deepEqual(mergeMatchingDrafts([hoodie],[{...tee,id:'hoodie'}]),[hoodie]);
});
test('restore repairs the exact live cross-product corruption from authoritative results',()=>{
  const state={designs:[{id:'hoodie-art'}],drafts:[tee],templateDetails:{batchId:'hoodie-session'},pricingApproved:true};
  const restored=restoreBatchDrafts(state,[tee,hoodie]);
  assert.deepEqual(restored.drafts,[hoodie]);assert.equal(restored.pricingApproved,false);
  assert.deepEqual(state.drafts,[tee]);
});
test('restore refreshes approved costs without replacing design text or product identity',()=>{
  const state={designs:[{id:'tee-art',title:'Hand-edited title'}],drafts:[{...tee,costReview:{required:true,approved:false},productName:'Saved tee'}],templateDetails:{batchId:'renewed-session'}};
  const restored=restoreBatchDrafts(state,[tee,hoodie]);
  assert.equal(restored.drafts[0].productName,'Saved tee');assert.equal(restored.designs[0].title,'Hand-edited title');assert.equal(restored.pricingApproved,true);
});
test('restoring a draft never approves local price edits that differ from the saved Printify prices',()=>{
  const draft={...tee,costReview:{required:true,approved:true,variants:[{id:123,price:2479,isEnabled:true}]}};
  const state={designs:[{id:'tee-art'}],drafts:[draft],pricingApproved:true,variantPrices:{123:2589}};
  assert.equal(restoreBatchDrafts(state,[draft]).pricingApproved,false);
  assert.equal(restoreBatchDrafts({...state,variantPrices:{123:2479}},[draft]).pricingApproved,true);
});
test('saved product defaults and draft existence cannot silently approve edited final prices',()=>{
  const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
  assert.match(source,/if\(restoringBatch\|\|!activeRecipe\|\|drafts\.some\(draft=>draft\.status==="Created"\)\)return;\s*const carries=recipeCarriesApprovedPricing/);
  assert.match(source,/setPricingApproved\(Boolean\(state\.pricingApproved\)\)/);
  assert.doesNotMatch(source,/setPricingApproved\(Boolean\(state\.pricingApproved\)\|\|Boolean\(state\.complete/);
  assert.match(source,/if\(index>=5&&complete\)issues\.push\(\.\.\.imagesStepIssues\(\)\)/);
});
test('rail and footer both require saving edited final prices before Listing',()=>{
  const state={connected:true,etsyConnected:true,productSelected:true,templateReady:true,shippingReady:true,variantsReady:true,bundleProductsReady:true,colorsReady:true,pricesReady:true,designCount:1,designsReady:true,etsyShippingProfileReady:true,draftsComplete:true,createdDraftCount:1,pricingApproved:false,imagesReady:true};
  assert.deepEqual(navigationIssues(5,state),['Save the item prices on the Drafts step.']);
  assert.deepEqual(leavingImagesIssues(state),['Save the item prices on the Drafts step.']);
  assert.deepEqual(navigationIssues(5,{...state,pricingApproved:true}),[]);
});
test('no matching session or ambiguous candidates never guesses a recovered draft',()=>{
  const state={designs:[{id:'hoodie-art'}],drafts:[],templateDetails:{batchId:'hoodie-session'}};
  assert.deepEqual(restoreBatchDrafts(state,[{...hoodie,batchId:'other'}]).drafts,[]);
  assert.deepEqual(restoreBatchDrafts(state,[hoodie,{...hoodie,id:'ambiguous'}]).drafts,[]);
});
test('reopening a template may renew its session but cannot orphan its exact saved design and product',()=>{
  const state={designs:[{id:'hoodie-art'}],drafts:[],templateDetails:{id:'hoodie-template',batchId:'renewed-session'}};
  const exact={...hoodie,sourceTemplateId:'hoodie-template'};
  assert.deepEqual(restoreBatchDrafts(state,[exact]).drafts,[exact]);
  assert.deepEqual(restoreBatchDrafts(state,[{...exact,sourceTemplateId:'tee-template'}]).drafts,[]);
  assert.deepEqual(restoreBatchDrafts(state,[exact,{...exact,id:'ambiguous'}]).drafts,[]);
});
test('snapshot validator rejects foreign client IDs and duplicate products but accepts pending and parent runs',()=>{
  assert.equal(batchDraftIdentityProblem({designs:[{id:'hoodie-art'}],drafts:[tee]}),true);
  assert.equal(batchDraftIdentityProblem({designs:[{id:'hoodie-art'}],drafts:[hoodie,hoodie]}),true);
  assert.equal(batchDraftIdentityProblem({designs:[{id:'hoodie-art'}],drafts:[{clientId:'hoodie-art',status:'NeedsRetry'}]}),false);
  assert.equal(batchDraftIdentityProblem({run:{}}),false);
  assert.equal(batchDraftIdentityProblem({designs:{},drafts:[null]}),true);
});
test('database atomically refuses to replace a batch with another product, while allowing its own saves',()=>{
  const source=readFileSync(new URL('../app/api/batches/route.ts',import.meta.url),'utf8');
  const sql=source.match(/const saved=await database\.prepare\("([^"]+)"\)/)[1];
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE listing_batches(id TEXT PRIMARY KEY,user_id TEXT,status TEXT,step TEXT,setup_name TEXT,product_title TEXT,design_count INTEGER,state_json TEXT,parent_batch_id TEXT,updated_at TEXT)');
  const save=(product,owner='owner')=>db.prepare(sql).run('batch',owner,'draft','designs','','',1,JSON.stringify({activeRecipe:{id:product}}),null);
  assert.equal(save('hoodie').changes,1);
  assert.equal(save('tee').changes,0);
  assert.equal(save('hoodie','another-user').changes,0);
  assert.equal(save('hoodie').changes,1);
  assert.equal(JSON.parse(db.prepare('SELECT state_json FROM listing_batches').get().state_json).activeRecipe.id,'hoodie');
  db.close();
});
test('writes remain ordered within one batch and independent across products',async()=>{
  const write=serializedBatchWrites(),events=[];let release;
  const held=new Promise(resolve=>release=resolve);
  const first=write('tee',async()=>{events.push('tee-old-start');await held;events.push('tee-old-end')});
  const second=write('tee',async()=>{events.push('tee-new')});
  await write('hoodie',async()=>{events.push('hoodie')});
  assert.deepEqual(events,['tee-old-start','hoodie']);release();await Promise.all([first,second]);
  assert.deepEqual(events,['tee-old-start','hoodie','tee-old-end','tee-new']);
});
test('one failed write does not permanently block future saves',async()=>{
  const write=serializedBatchWrites();await assert.rejects(write('tee',async()=>{throw Error('offline')}));
  assert.equal(await write('tee',async()=>42),42);
});
test('pricing captures its original batch before waiting and merges only matching live drafts',()=>{
  const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
  const block=source.slice(source.indexOf('async function approveActualPricingGroup'),source.indexOf('async function syncPreparedListing'));
  assert.match(block,/const sourceBatchId=batchIdRef.current/);
  assert.match(block,/setDrafts\(current=>mergeMatchingDrafts\(current,saved\)\)/);
  assert.match(block,/persistBatchNow\(sourceBatchId,\{\.\.\.sourceSnapshot/);
  assert.doesNotMatch(block,/setDrafts\(nextDrafts\)/);
});
test('a fresh batch clears all run-specific focus and approval state',()=>{
  const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
  const block=source.slice(source.indexOf('function clearCurrentBatch('),source.indexOf('async function selectRecipe('));
  for(const expected of ['setActiveTask("")','setPhotoFocusId("")','setReviewEdit(null)','setOpenFacet({})','setSelectedPlacementDrafts([])','setBundleApproved({})','setBundlePrices({})','setBundleSizeChoices({})','setMissingPhotoDraftIds([])'])assert.ok(block.includes(expected),expected);
});
test('warning modals identify designs without exposing junk filenames',()=>{
  const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
  const block=source.slice(source.indexOf('{missingPhotoDraftIds.length>0&&typeof document'),source.indexOf('{missingPhotoDraftIds.length>0&&typeof document')+6000);
  assert.doesNotMatch(block,/\{design\?\.name\|\|draft\?\.name/);
  assert.doesNotMatch(block,/name:`\$\{issue\.fileName\}/);
  assert.match(block,/name:`Design \$\{/);
});
