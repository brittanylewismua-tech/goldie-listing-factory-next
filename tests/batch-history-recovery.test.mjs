import test from 'node:test';import assert from 'node:assert/strict';
import {readBatchHistory,preparedDaysFromHistory,removeHistoryRows} from '../app/batch-history-read.ts';
test('unavailable and malformed history never become an empty saved-batch list',async()=>{
 for(const response of [Response.json({error:'temporarily unavailable'},{status:503}),Response.json({error:'sign in'},{status:401}),Response.json({})])await assert.rejects(readBatchHistory(async()=>response));
 assert.deepEqual((await readBatchHistory(async()=>Response.json({batches:[],prepared:[]}))).batches,[]);
});
test('missing counts are unknown, while a verified empty count is zero',()=>{
 assert.throws(()=>preparedDaysFromHistory({prepared:[],preparedAvailable:false}));assert.throws(()=>preparedDaysFromHistory({}));assert.deepEqual(preparedDaysFromHistory({prepared:[],preparedAvailable:true}),[]);
});
test('interrupted history reads time out instead of loading indefinitely',async()=>{
 const timer=setTimeout(()=>{},1000);try{await assert.rejects(readBatchHistory(async(_,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason))),10))}finally{clearTimeout(timer)}
});
test('partial removal keeps confirmed results, stops after uncertainty, and never retries',async()=>{
 const calls=[];const result=await removeHistoryRows(['first','lost','third'],async url=>{calls.push(url);if(url.includes('lost'))throw Error('reply lost');return Response.json({deleted:true})});
 assert.deepEqual(result,{confirmed:['first'],uncertain:true});assert.equal(calls.length,2);
});
test('declined removal cannot be reported as confirmed',async()=>{assert.deepEqual(await removeHistoryRows(['first'],async()=>Response.json({error:'sign in'},{status:401})),{confirmed:[],uncertain:true})});

test('successful history retry refreshes the sidebar count, but unavailable counts do not',async()=>{
 const previous=globalThis.window,events=[];globalThis.window={dispatchEvent:event=>events.push(event.detail)};
 try{
  await readBatchHistory(async()=>Response.json({batches:[],prepared:[{day:'2026-09-06',count:147}],preparedAvailable:true}));
  await readBatchHistory(async()=>Response.json({batches:[],prepared:[],preparedAvailable:false}));
  assert.deepEqual(events,[[{day:'2026-09-06',count:147}]]);
 }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous}
});
