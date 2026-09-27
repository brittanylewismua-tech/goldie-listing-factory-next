import test from 'node:test';
import assert from 'node:assert/strict';
import {liveTrademarkQuery,readLiveTrademarkSearch,liveTrademarkSearch} from '../app/trademark-live.ts';
const source={alive:true,id:'86019352',wordmark:'BORN THIS WAY',ownerName:['Too Faced Cosmetics, LLC (LIMITED LIABILITY COMPANY; DELAWARE, USA)'],internationalClass:['IC 003'],goodsAndServices:['IC 003: Cosmetics and cosmetic preparations.'],registrationId:'4782507',registrationDate:'2015-07-28',filedDate:'2013-07-25T00:00:00'};
const response=(rows=[source],over={})=>({timedOut:false,shardsFailed:0,hits:{totalValue:rows.length,totalRelation:'eq',hits:rows.map(source=>({source}))},...over});
test('USPTO search asks for a live phrase, without expanding it into unrelated single words',()=>{
 const q=liveTrademarkQuery('born this way');assert.deepEqual(q.query.bool.filter,[{term:{LD:'true'}}]);assert.deepEqual(q.query.bool.must[0].bool.should,[{match_phrase:{WM:{query:'born this way'}}}]);assert.equal(q.size,200);
});
test('an observed registered phrase carries its owner and actual goods, not a made-up product warning',()=>{
 const result=readLiveTrademarkSearch(response(),'born this way',100);assert.equal(result.complete,true);assert.equal(result.records[0].registered,true);assert.equal(result.records[0].exact,true);assert.deepEqual(result.records[0].classes,['003']);assert.equal(result.records[0].owner,'Too Faced Cosmetics, LLC');assert.deepEqual(result.records[0].goods,source.goodsAndServices);
});
test('longer marks are found but BORN and THIS are not presented as phrase matches',()=>{
 const r=readLiveTrademarkSearch(response([{...source,wordmark:'TOO FACED BORN THIS WAY'},{...source,id:'79445171',wordmark:'BORN'},{...source,id:'50032910',wordmark:'THIS.'}]),'born this way');assert.equal(r.records.length,1);assert.equal(r.records[0].containsPhrase,true);assert.equal(r.records[0].exact,false);assert.equal(r.complete,false);
});
test('dead records, missing status metadata and interrupted searches never yield a complete result',()=>{
 const unknown={...source};delete unknown.registrationId;
 for(const row of [{...source,alive:false},unknown]) assert.equal(readLiveTrademarkSearch(response([row]),'born this way').complete,false);
 assert.throws(()=>readLiveTrademarkSearch(response([],{timedOut:true}),'born this way'));
 assert.throws(()=>readLiveTrademarkSearch(response([],{shardsFailed:1}),'born this way'));
});
test('unregistered live applications and limited result pages keep their real status',()=>{
 const r=readLiveTrademarkSearch(response([{...source,registrationId:null,registrationDate:null}]),'born this way');assert.equal(r.records[0].registered,false);
 const p=response();p.hits.totalValue=300;assert.equal(readLiveTrademarkSearch(p,'born this way').complete,false);
});
test('joined spelling uses known exact aliases without adding single-word searches',()=>{
 const q=liveTrademarkQuery('Hauslabs',['HAUS LABS']);assert.equal(q.query.bool.must[0].bool.should[1].match_phrase.WM.query,'HAUS LABS');
 assert.equal(readLiveTrademarkSearch(response([{...source,wordmark:'HAUS LABS'}]),'Hauslabs').records[0].exact,true);
});
test('rate limiting and malformed responses fail back to the local check; concurrent identical searches share one request',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(options.redirect,'manual','Workers support manual, not error; redirect responses are rejected by the HTTP guard');calls++;return new Response(JSON.stringify(response()),{status:200});});
 const results=await Promise.all([liveTrademarkSearch('born this way'),liveTrademarkSearch('born this way')]);assert.equal(calls,1);assert.equal(results[0].records.length,1);
 t.mock.method(globalThis,'fetch',async()=>new Response('too many requests',{status:429}));assert.equal(await liveTrademarkSearch('different phrase'),null);
 t.mock.method(globalThis,'fetch',async()=>new Response('<html>challenge</html>',{status:200}));assert.equal(await liveTrademarkSearch('different phrase'),null);
});
