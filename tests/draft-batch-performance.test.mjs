import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const url=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpile(s,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64');
const bounded=url(read('app/bounded-work.ts'));
const {prepareDraftBatch}=await import(url(read('app/draft-batch-preparation.ts').replace("'./bounded-work'",`'${bounded}'`)));
const timing=url(read('app/api/listing-photos/delivery/timing.ts'));
const {candidateWaitMs,transferPollMs}=await import(timing);
const turn=()=>new Promise(resolve=>setImmediate(resolve));
test('20 preparations run three at a time, settle once each, and report actual progress',async()=>{
 let active=0,peak=0;const pending=[],started=[],progress=[];let resolved=false;
 const work=prepareDraftBatch(Array.from({length:20},(_,i)=>i),async i=>{started.push(i);active++;peak=Math.max(peak,active);await new Promise(resolve=>pending.push(()=>{active--;resolve()}))},(done,total)=>progress.push([done,total])).then(errors=>{resolved=true;return errors});
 await turn();assert.equal(started.length,3);assert.equal(resolved,false);
 let waves=0;while(!resolved){const wave=pending.splice(0);assert.ok(wave.length<=3);wave.forEach(release=>release());waves++;await turn()}
 assert.deepEqual(await work,[]);assert.equal(peak,3);assert.equal(waves,7);assert.equal(new Set(started).size,20);assert.deepEqual(progress,Array.from({length:20},(_,i)=>[i+1,20]));
});
test('one failed preparation does not abandon remaining listings or unlock while another request runs',async()=>{
 let release,settled=false;const started=[];
 const result=prepareDraftBatch([0,1,2,3,4],async i=>{started.push(i);if(i===0)throw Error('First listing failed');if(i===1)await new Promise(resolve=>release=resolve)}).then(errors=>{settled=true;return errors});
 await turn();assert.deepEqual([...started].sort(),[0,1,2,3,4]);assert.equal(settled,false);release();const errors=await result;assert.equal(errors.length,1);assert.equal(errors[0].message,'First listing failed');
});
test('empty and single-listing preparation do not spawn unnecessary tasks',async()=>{
 let calls=0;assert.deepEqual(await prepareDraftBatch([],async()=>calls++),[]);assert.equal(calls,0);await prepareDraftBatch([1],async()=>calls++);assert.equal(calls,1);
});
test('automatic candidate still needs a second read after five seconds; legacy grace stays thirty seconds',()=>{
 assert.equal(candidateWaitMs(true,null,10000),5000);assert.equal(candidateWaitMs(true,10000,12000),3000);assert.equal(candidateWaitMs(true,10000,15000),0);assert.equal(candidateWaitMs(false,null,10000),30000);assert.equal(candidateWaitMs(false,10000,15000),25000);
});
test('quick polling is limited to recently submitted automatic transfers, not idle or rejected jobs',()=>{
 for(const phase of ['submitted','accepted'])assert.equal(transferPollMs({phase,submittedAt:1000},110000),10000);
 for(const transfer of [null,{phase:'ready'},{phase:'rejected',submittedAt:1000},{phase:'accepted'},{phase:'accepted',submittedAt:1000}])assert.equal(transferPollMs(transfer,121000),undefined);
});
// Exercise real service control flow with only network/storage adapters replaced.
let row,published,locked,paused,updates;
const runtime={DB:{prepare(sql){return {bind(){return this},async first(){if(sql.startsWith('SELECT * FROM photo_deliveries'))return row;if(sql.includes('paused_until'))return {paused_until:paused};return {encrypted_token:'test'}},async run(){updates.push(sql);return {meta:{changes:1}}}}}}};
globalThis.__deliveryTiming={runtime,get row(){return row},get published(){return published},get locked(){return locked}};
let service=read('app/api/listing-photos/delivery/service.ts').replace(/^import .*;\n/gm,'');
service=`import {candidateWaitMs,transferPollMs} from '${timing}';
const env=globalThis.__deliveryTiming.runtime;
class DeliveryReviewRequired extends Error{};class DraftReviewRequired extends Error{};class DraftWriteRejected extends Error{};class DraftTransferReviewRequired extends Error{};
const etsyConnection=async()=>({shopId:200,token:'test'}),decryptPrintifyToken=async()=>'test';
const readPrintifyPublishState=async reader=>{await reader('https://printify.test');return globalThis.__deliveryTiming.published};
`+service;
const {runDeliveryTick}=await import(url(service));
function reset(){row={id:'job',user_id:'owner',status:'delivering',draft_json:'{}',transfer_json:JSON.stringify({phase:'accepted',submittedAt:Date.now()}),state_json:null,candidate_listing_id:123,candidate_seen_at:Date.now(),etsy_shop_id:200,expires_at:Date.now()+86400000};published={state:'unknown',reason:'Busy'};locked=true;paused=0;updates=[]}
const originalFetch=globalThis.fetch;
test('real service uses faster processing checks without sending another transfer',async()=>{reset();globalThis.fetch=async()=>Response.json({is_locked:true});try{const result=await runDeliveryTick('job','owner');assert.equal(result.waitMs,10000);assert.equal(result.done,false)}finally{globalThis.fetch=originalFetch}});
test('changed destination resets the confirmation period and cannot edit during confirmation',async()=>{reset();published={state:'published',listingId:456};globalThis.fetch=async()=>Response.json({is_locked:false});try{const result=await runDeliveryTick('job','owner');assert.equal(result.waitMs,5000);assert.ok(updates.some(sql=>sql.includes('candidate_listing_id=?')))}finally{globalThis.fetch=originalFetch}});
test('Etsy cooldown prevents all outbound calls and preserves the job for automatic continuation',async()=>{reset();paused=Math.ceil(Date.now()/1000)+90;globalThis.fetch=async()=>{throw Error('must not call network during cooldown')};try{const result=await runDeliveryTick('job','owner');assert.equal(result.done,false);assert.ok(result.waitMs>=89000);assert.ok(updates.some(sql=>sql.includes('status=?,error=?')))}finally{globalThis.fetch=originalFetch}});
