import test from 'node:test';
import assert from 'node:assert/strict';
import {packBatchSnapshot,unpackBatchSnapshot} from '../app/batch-snapshot-storage.ts';
import {restoreBatchDrafts} from '../app/batch-draft-integrity.ts';
function bucket(){const objects=new Map();return {objects,async put(key,bytes,options){objects.set(key,{bytes,customMetadata:options.customMetadata});},async get(key){const o=objects.get(key);return o?{customMetadata:o.customMetadata,arrayBuffer:async()=>o.bytes.slice().buffer}:null;}};}
const template={id:'template',batchId:'session',previewImage:'thumb',variants:Array.from({length:500},(_,i)=>({id:i,colorId:i,price:2000})),printPositions:['front']};
test('large templates round trip, retain history thumbnail and refuse another owner',async()=>{
  const b=bucket(),state={templateDetails:template,selectedColorIds:[1],printifyImageSelections:{design:[2,3,7]}};
  const packed=await packBatchSnapshot(state,'owner',b,[]);assert.ok(JSON.stringify(packed).length<1000);assert.equal(packed.templateDetails.previewImage,'thumb');
  assert.deepEqual(await unpackBatchSnapshot(packed,'owner',b),state);await assert.rejects(unpackBatchSnapshot(packed,'other',b),/ownership/);
});
test('only exact owned canonical draft media is removed; legacy and failed drafts survive',async()=>{
  const canonical={id:'p',clientId:'d',batchId:'session',status:'Created',printifyImages:['a','b'],printifyImageDetails:[{src:'a'}],colorPreviewImageDetails:[{src:'b'}]};
  const legacy={id:'legacy',clientId:'legacy-d',printifyImages:['legacy']};
  const state={templateDetails:template,designs:[{id:'d'},{id:'legacy-d'}],drafts:[canonical,legacy],printifyImageSelections:{d:[1]}};
  const b=bucket(),packed=await packBatchSnapshot(state,'owner',b,[{id:'p',clientId:'d'}]);assert.equal(packed.drafts[0].printifyImages,undefined);assert.deepEqual(packed.drafts[1],legacy);
  assert.deepEqual(restoreBatchDrafts(await unpackBatchSnapshot(packed,'owner',b),[canonical]).drafts,state.drafts);
  assert.deepEqual((await packBatchSnapshot(state,'owner',b,[{id:'p',clientId:'wrong'}])).drafts,state.drafts);
});
test('missing private template is not silently replaced with an incomplete summary',async()=>{
  const b=bucket(),packed=await packBatchSnapshot({templateDetails:template},'owner',b,[]);b.objects.clear();await assert.rejects(unpackBatchSnapshot(packed,'owner',b),/could not be loaded/);
});
test('small and legacy templates need no storage access',async()=>{
  const b={put(){throw Error('unexpected')},get(){throw Error('unexpected')}};
  const state={templateDetails:{id:'small'}};assert.deepEqual(await packBatchSnapshot(state,'owner',b,[]),state);assert.deepEqual(await unpackBatchSnapshot(state,'owner',b),state);
});
