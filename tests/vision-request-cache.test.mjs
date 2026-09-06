import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {cachedVisionFetch,visionRequestKey,VISION_CACHE_SCHEMA} from '../app/vision-request-cache.ts';
const endpoint='https://fal.run/openrouter/router/vision';
const init={method:'POST',body:JSON.stringify({image_urls:['data:image/png;base64,test'],prompt:'test',model:'model'})};
const result=()=>Response.json({output:'{"category":"Hoodies"}',usage:{cost:0.001}});
function fixture(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(VISION_CACHE_SCHEMA);
  const db={prepare(sql){let args=[];return {bind(...values){args=values;return this;},async run(){return {meta:sqlite.prepare(sql).run(...args)};},async first(){return sqlite.prepare(sql).get(...args)||null;}};}};
  return {sqlite,db};
}
test('separate server handlers coordinate one provider call and reuse its result',async()=>{
  const {db,sqlite}=fixture();let calls=0,release,started;
  const gate=new Promise(r=>release=r),begun=new Promise(r=>started=r);
  const provider=async()=>{calls++;started();await gate;return result();};
  const first=cachedVisionFetch('owner',db,provider)(endpoint,init);await begun;
  const second=cachedVisionFetch('owner',db,provider,{sleep:async()=>release()})(endpoint,init);
  const [a,b]=await Promise.all([first,second]);assert.equal(calls,1);assert.deepEqual(await a.json(),await b.json());
  assert.equal(b.headers.get('X-Goldie-AI-Reused'),'true');
  const third=await cachedVisionFetch('owner',db,provider)(endpoint,init);assert.equal(calls,1);assert.equal(third.status,200);
  const stored=sqlite.prepare('SELECT * FROM ai_vision_requests').get();assert.equal(stored.request_key.length,64);assert.equal(JSON.stringify(stored).includes('base64'),false);sqlite.close();
});
test('owner, image, product prompt and request version isolate cached results',async()=>{
  const {db,sqlite}=fixture();let calls=0;const provider=async()=>{calls++;return result();};
  await cachedVisionFetch('a',db,provider)(endpoint,init);
  await cachedVisionFetch('b',db,provider)(endpoint,init);
  await cachedVisionFetch('a',db,provider)(endpoint,{...init,body:JSON.stringify({prompt:'different product'})});
  assert.equal(calls,3);assert.notEqual(await visionRequestKey('a',endpoint,init.body),await visionRequestKey('b',endpoint,init.body));sqlite.close();
});
test('expired results can refresh and expired crashed leases do not strand users',async()=>{
  const {db,sqlite}=fixture();let time=1000,calls=0;const provider=async()=>{calls++;return result();};
  const run=cachedVisionFetch('owner',db,provider,{now:()=>time});await run(endpoint,init);time+=86400001;await run(endpoint,init);assert.equal(calls,2);
  sqlite.prepare('UPDATE ai_vision_requests SET response_json=NULL,expires_at=?').run(time-1);await run(endpoint,init);assert.equal(calls,3);sqlite.close();
});
test('a pending duplicate times out without buying another response',async()=>{
  const {db,sqlite}=fixture();let time=1000,calls=0;const key=await visionRequestKey('owner',endpoint,init.body);
  sqlite.prepare('INSERT INTO ai_vision_requests VALUES(?,?,NULL,?)').run(key,'other',time+180000);
  const response=await cachedVisionFetch('owner',db,async()=>{calls++;return result();},{now:()=>time,sleep:async()=>{time+=10000;}})(endpoint,init);
  assert.equal(response.status,503);assert.equal(calls,0);assert.equal(response.headers.get('Retry-After'),'5');sqlite.close();
});
test('failed provider requests release their own lease and are not cached',async()=>{
  const {db,sqlite}=fixture();let calls=0;
  const run=cachedVisionFetch('owner',db,async()=>{calls++;return calls===1?Response.json({detail:'temporary'},{status:503}):result();});
  assert.equal((await run(endpoint,init)).status,503);assert.equal((await run(endpoint,init)).status,200);assert.equal(calls,2);sqlite.close();
});
test('cache read or write outages do not discard successful paid output',async()=>{
  const {db,sqlite}=fixture();const broken={prepare(){throw Error('database unavailable');}};
  assert.equal((await cachedVisionFetch('owner',broken,async()=>result())(endpoint,init)).status,200);
  const writeBroken={prepare(sql){if(sql.startsWith('UPDATE'))throw Error('write unavailable');return db.prepare(sql);}};
  assert.equal((await cachedVisionFetch('owner',writeBroken,async()=>result())(endpoint,init)).status,200);sqlite.close();
});
test('invalid outputs are not cached and cleanup is restricted to this cache',async()=>{
  const {db,sqlite}=fixture();let calls=0;const run=cachedVisionFetch('owner',db,async()=>{calls++;return Response.json({unexpected:true});});
  await run(endpoint,init);await run(endpoint,init);assert.equal(calls,2);assert.equal(sqlite.prepare('SELECT count(*) n FROM ai_vision_requests').get().n,0);sqlite.close();
});
test('deployed schema matches executable schema; authorization precedes details-only caching',()=>{
  const normalize=s=>s.replace(/\s+/g,' ').trim();assert.equal(normalize(readFileSync(new URL('../tools/ai-vision-cache-schema.sql',import.meta.url),'utf8')),normalize(VISION_CACHE_SCHEMA));
  const source=readFileSync(new URL('../app/api/listing-intelligence/route.ts',import.meta.url),'utf8');
  assert.ok(source.indexOf('customerLaunchBlock(user)')<source.indexOf('cachedVisionFetch(user.userId'));
  assert.match(source,/body.mode==="title"\?boundedVisionFetch:cachedVisionFetch/);
});
