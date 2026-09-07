import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {DatabaseSync} from 'node:sqlite';import ts from 'typescript';import {pacingModule} from './etsy-pacing-module.mjs';
const {RESERVE_ETSY_SLOT_SQL,etsyRequestInterval,paceEtsyRequest,EtsyRateLimited}=await import(pacingModule);
const read=p=>readFileSync(p,'utf8');const url=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpile(s,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64');
const engine=url(read('app/api/listing-photos/delivery/draft-engine.ts').replace("from '../../etsy/request-pacing'",`from '${pacingModule}'`));
const {readDraft}=await import(url(read('app/api/listing-photos/delivery/draft-service.ts').replace("from './draft-engine'",`from '${engine}'`)));
test('600 arrivals at low/default/observed capacity cannot extend the queue with rejected reservations',()=>{
 for(const qps of [1,5,150]){const db=new DatabaseSync(':memory:');try{db.exec(read('drizzle/0025_etsy_request_pacing.sql'));let now=1000,accepted=0;const interval=etsyRequestInterval(qps),slots=new Set();
 for(let wave=0;wave<30&&accepted<600;wave++){for(let n=accepted;n<600;n++){const row=db.prepare(RESERVE_ETSY_SLOT_SQL).get(now,interval,now);if(row){assert.ok(row.next_at_ms-interval-now<=30000);assert.ok(!slots.has(row.next_at_ms));slots.add(row.next_at_ms);accepted++}}
 const before=db.prepare('SELECT next_at_ms FROM etsy_request_pacing').get().next_at_ms;
 if(accepted<600){for(let attempt=0;attempt<1000;attempt++)assert.equal(db.prepare(RESERVE_ETSY_SLOT_SQL).get(now,interval,now),undefined);assert.equal(db.prepare('SELECT next_at_ms FROM etsy_request_pacing').get().next_at_ms,before)}now=before+1;}
 assert.equal(accepted,600);
 }finally{db.close()}}
});
test('full-queue refusal is definite and makes no outbound wait or request',async()=>{await assert.rejects(paceEtsyRequest({now:()=>1,read:async()=>({pausedUntil:0,qps:5}),reserve:async()=>null,wait:async()=>assert.fail('must yield')}),EtsyRateLimited)});
const product={variants:[{id:1,sku:'qa',price:2000,is_enabled:true}]};
const listing={shop_id:7,state:'draft',title:'QA',description:'Description',tags:['qa'],taxonomy_id:1,shipping_profile_id:8};
const payload=path=>path.endsWith('/inventory')?{products:[{sku:'qa',offerings:[{is_enabled:true,price:{amount:2000,divisor:100}}]}]}:path.endsWith('/properties')?{results:[]}:{personalization_questions:[]};
test('metadata read requires two dependency waves instead of four while preserving all checks',async()=>{
 let release;const gate=new Promise(r=>release=r),calls=[];const pending=readDraft(async path=>{calls.push(path);if(path==='/listings/123')return Response.json(listing);await gate;return Response.json(payload(path))},123,7,product);
 for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));assert.equal(calls.length,4,'all three independent reads start after owner check');release();assert.equal((await pending).basic.title,'QA');
});
test('wrong shop or live listing makes zero additional reads',async()=>{for(const changed of [{shop_id:8},{state:'active'}]){let calls=0;await assert.rejects(readDraft(async()=>{calls++;return Response.json({...listing,...changed})},123,7,product));assert.equal(calls,1)}});
test('one failed read waits for its in-flight siblings before exposing an error or allowing a retry',async()=>{
 let release,settled=false;const gate=new Promise(r=>release=r);const pending=readDraft(async path=>{if(path==='/listings/123')return Response.json(listing);if(path.endsWith('/properties'))throw Error('provider failure');await gate;return Response.json(payload(path))},123,7,product).then(()=>assert.fail('must fail'),error=>{settled=true;assert.match(error.message,/provider failure/)});
 for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));assert.equal(settled,false);release();await pending;assert.equal(settled,true);
});
test('parallel inventory read still rejects changed prices before returning any editable draft',async()=>{await assert.rejects(readDraft(async path=>Response.json(path==='/listings/123'?listing:payload(path)),123,7,{variants:[{id:1,sku:'qa',price:1,is_enabled:true}]}),/price differs/)});
