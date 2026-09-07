import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {DatabaseSync} from 'node:sqlite';import ts from 'typescript';
import {pacingModule} from './etsy-pacing-module.mjs';
const {EtsyRateLimited,paceEtsyRequest,etsyRequestInterval,RESERVE_ETSY_SLOT_SQL}=await import(pacingModule);
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace("from '../../etsy/request-pacing'",`from '${pacingModule}'`);
const load=async s=>import('data:text/javascript;base64,'+Buffer.from(ts.transpile(s,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64'));
const {deliveryStep}=await load(read('app/api/listing-photos/delivery/engine.ts'));
const {draftStep}=await load(read('app/api/listing-photos/delivery/draft-engine.ts'));
test('twenty simultaneous reservations are spaced atomically and use observed capacity with headroom',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(read('drizzle/0025_etsy_request_pacing.sql'));const now=1000,interval=etsyRequestInterval(10);
 const slots=await Promise.all(Array.from({length:20},async()=>db.prepare(RESERVE_ETSY_SLOT_SQL).get(now,interval,now).next_at_ms));
 assert.equal(new Set(slots).size,20);assert.deepEqual(slots,Array.from({length:20},(_,i)=>now+(i+1)*interval));assert.ok(interval>=1000/7);assert.equal(etsyRequestInterval(1),1000);db.close();
});
test('cooldown arriving while a request waits prevents its outbound call',async()=>{let now=1000,paused=0,calls=0;await assert.rejects(paceEtsyRequest({now:()=>now,read:async()=>({qps:5,pausedUntil:paused}),reserve:async()=>3000,wait:async ms=>{now+=ms;paused=now+10000}}).then(()=>calls++),EtsyRateLimited);assert.equal(calls,0)});
test('overloaded reservation queues yield instead of holding a worker indefinitely',async()=>{await assert.rejects(paceEtsyRequest({now:()=>1000,read:async()=>({qps:5,pausedUntil:0}),reserve:async()=>100000,wait:async()=>assert.fail('must not sleep')}),/queued/)});
test('twenty concurrent draft finishers recover definite quota refusals and preserve custom/guide order without duplicate writes',async()=>{
 const db=new DatabaseSync(':memory:');db.exec(read('drizzle/0025_etsy_request_pacing.sql'));
 let now=1000,paused=0,refused=0,finished=0,photoCount=0,metadataCount=0,nextImage=10000;const waits=[],outbound=[],errors=[];
 const wait=ms=>new Promise(resolve=>waits.push({at:now+ms,resolve}));
 const paced=async()=>{await paceEtsyRequest({now:()=>now,read:async()=>({qps:10,pausedUntil:paused}),reserve:async(n,interval)=>db.prepare(RESERVE_ETSY_SLOT_SQL).get(n,interval,n).next_at_ms,wait});outbound.push(now)};
 const jobs=Array.from({length:20},(_,index)=>({id:index+1,metadata:null,photos:null,images:[1,2,3,4,5].map(rank=>({rank,listing_image_id:(index+1)*100+rank})),view:{shopId:7,state:'draft',basic:{title:'Old',description:'Old',tags:[],taxonomy_id:1,shipping_profile_id:8},properties:[],questions:[]},writes:[]}));
 const desired={title:'Saved',description:'Saved description',tags:['books'],taxonomy_id:2,shipping_profile_id:8,properties:[{property_id:10,value_ids:[11],values:['Cotton']}],questions:[{question_type:'text_input',question_text:'Name',required:true,max_allowed_characters:32}]};
 const photos=['custom','front','guide','back'].map(key=>({key,type:'image/jpeg'}));
 const tasks=jobs.map(async j=>{
  try{for(let tick=0;tick<240;tick++){
   try{
    if(!j.metadata?.verified){const result=await draftStep({read:async()=>{await paced();return structuredClone(j.view)},backup:async()=>{},save:async s=>j.metadata=structuredClone(s),write:async op=>{await paced();if(refused===0){refused++;paused=now+1000;throw new EtsyRateLimited('quota')};metadataCount++;if(op.key==='basic')j.view.basic=structuredClone(op.value);else if(op.key==='questions')j.view.questions=structuredClone(op.value);else j.view.properties=[structuredClone(op.value)]}},7,j.id,desired,j.metadata);if(!result.done){await wait(1);continue}}
    const result=await deliveryStep({read:async()=>{await paced();return {shopId:7,state:'draft',images:structuredClone(j.images)}},backup:async()=>{},save:async s=>j.photos=structuredClone(s),upload:async(photo,rank)=>{await paced();if(refused===1){refused++;paused=now+1000;throw new EtsyRateLimited('quota')};const id=++nextImage;photoCount++;j.writes.push([photo.key,rank]);j.images=[...j.images.filter(i=>i.rank!==rank),{rank,listing_image_id:id}];return id},remove:async id=>{await paced();if(refused===2){refused++;paused=now+1000;throw new EtsyRateLimited('quota')};j.images=j.images.filter(i=>i.listing_image_id!==id)}},7,j.id,photos,j.photos,'draft');
    if(result.done){finished++;return}
   }catch(error){if(!(error instanceof EtsyRateLimited))throw error;assert.equal(j.photos?.pending,undefined);assert.equal(j.metadata?.pending,undefined)}
   await wait(Math.max(1,paused-now));
  }throw Error('operation bound reached')
  }catch(error){errors.push(error)}
 });
 // Advance a deterministic provider clock; no network calls or wall-clock performance claim.
 for(let step=0;step<20000&&finished+errors.length<20;step++){
  await new Promise(resolve=>setImmediate(resolve));if(!waits.length)continue;
  const next=Math.min(...waits.map(w=>w.at));now=Math.max(now,next);const due=waits.filter(w=>w.at<=now);for(const w of due){waits.splice(waits.indexOf(w),1);w.resolve()}
 }
 await Promise.all(tasks);assert.deepEqual(errors,[]);assert.equal(finished,20);assert.equal(refused,3);assert.equal(photoCount,80);assert.equal(metadataCount,60);
 for(const j of jobs){assert.equal(j.metadata.verified,true);assert.equal(j.photos.pending,undefined);assert.deepEqual(j.writes,photos.map((p,i)=>[p.key,i+1]));assert.equal(j.images.length,4)}
 // Reservations enforce spacing; overlapping waits may share an instant only if a cooldown intervenes.
 assert.ok(outbound.length>100);db.close();
});
test('lost photo response still preserves its pending receipt and cannot be retried blindly',async()=>{let saved=null,calls=0;const io={read:async()=>({shopId:7,state:'draft',images:[]}),backup:async()=>{},save:async s=>saved=structuredClone(s),upload:async()=>{calls++;throw Error('lost response')},remove:async()=>{}};await assert.rejects(deliveryStep(io,7,1,[{key:'custom',type:'image/jpeg'}],null,'draft'));assert.ok(saved.pending);await assert.rejects(deliveryStep(io,7,1,[{key:'custom',type:'image/jpeg'}],saved,'draft'),/prevent duplicate/);assert.equal(calls,1)});
