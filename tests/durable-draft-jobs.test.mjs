import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createProductWithImageRetries,UncertainProductCreation} from '../app/api/printify/product-creation.ts';
import {CLAIM_DRAFT_JOB_SQL,pendingDraftJob,writeJobObject,readJobObject,cleanupCompletedDraftJob} from '../app/api/printify/draft-job-store.ts';
import {draftCreationKey,draftVariantSku} from '../app/api/printify/draft-identity.ts';
import {reconcileDraftJob} from '../app/api/printify/reconcile-draft-job.ts';
import {retryAfterMilliseconds,waitForDraftRetry,RetryDraftLater} from '../app/api/printify/retry-after.ts';

test('long provider cooldowns yield to durable scheduling without shortening them',async()=>{
  await assert.rejects(waitForDraftRetry(95000),error=>error instanceof RetryDraftLater&&error.milliseconds===95000);
});
test('completed checkpoint cleanup cannot delete saved artwork or another job',async()=>{
  let deleted=[];
  await cleanupCompletedDraftJob({async list(options){assert.equal(options.prefix,'draft-jobs/owner/job/');return {objects:[{key:'draft-jobs/owner/job/input.json'},{key:'draft-jobs/owner/other/product.json'},{key:'saved-artwork/design.png'}],truncated:false}},async delete(keys){deleted=keys}},'owner','job');
  assert.deepEqual(deleted,['draft-jobs/owner/job/input.json']);
});
test('checkpoint cleanup is restartable and signals remaining pages',async()=>{
  const objects=[{key:'draft-jobs/owner/job/input.json'},{key:'draft-jobs/owner/job/product.json'}];
  const bucket={async list(){return {objects:objects.slice(0,1),truncated:objects.length>1}},async delete(keys){for(const key of keys){const index=objects.findIndex(object=>object.key===key);if(index>=0)objects.splice(index,1)}}};
  await assert.rejects(cleanupCompletedDraftJob(bucket,'owner','job'),/remain to clean up/);
  await cleanupCompletedDraftJob(bucket,'owner','job');
  await cleanupCompletedDraftJob(bucket,'owner','job');
  assert.equal(objects.length,0);
});

test('lost, gateway, malformed and ID-less success responses never replay a creation POST',async()=>{
  for(const reply of [()=>{throw Error('connection lost')},()=>new Response('gateway',{status:502}),()=>new Response('{'),()=>Response.json({})]){
    let posts=0,checks=0;
    await assert.rejects(createProductWithImageRetries({path:'/shops/1/products.json',token:'fake',body:'{}',fetcher:async()=>{posts++;return reply()},sleeper:async()=>{throw Error('must not retry')},reconcile:async()=>{checks++;return null}}),UncertainProductCreation);
    assert.equal(posts,1);assert.equal(checks,1);
  }
});
test('an interrupted response adopts the exact reconciled product without another POST',async()=>{
  let calls=0;const found={id:'already-created'};
  const result=await createProductWithImageRetries({path:'/shops/1/products.json',token:'fake',body:'{}',fetcher:async()=>{calls++;throw Error('lost')},reconcile:async()=>found});
  assert.equal(result,found);assert.equal(calls,1);
});
test('only a definite rejection retries, respecting the full provider cooldown',async()=>{
  let calls=0,before=0;const waits=[];
  const result=await createProductWithImageRetries({path:'/shops/1/products.json',token:'fake',body:'{}',fetcher:async()=>++calls===1?new Response('limited',{status:429,headers:{'retry-after':'95'}}):Response.json({id:'created'}),sleeper:async ms=>{waits.push(ms)},onBeforeCreate:async()=>{before++}});
  assert.equal(result.id,'created');assert.equal(calls,2);assert.equal(before,2);assert.deepEqual(waits,[95000]);
  assert.equal(retryAfterMilliseconds('Wed, 01 Jan 2031 00:01:00 GMT',1000,Date.parse('2031-01-01T00:00:00Z')),60000);
});
test('quota admission is atomic and never expires an uncertain reservation',()=>{
  const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE printify_draft_results(request_key TEXT PRIMARY KEY,user_id TEXT,batch_id TEXT,client_id TEXT,status TEXT,response_json TEXT,updated_at TEXT,created_at TEXT)');
  const claim=db.prepare(CLAIM_DRAFT_JOB_SQL),pending=JSON.stringify({version:1,inputKey:'private',workflowId:'job',phase:'queued'});
  let admitted=0;for(let n=0;n<500;n++)if(claim.get('key'+n,'owner','batch','client'+n,20,pending))admitted++;
  assert.equal(admitted,20);
  db.exec("UPDATE printify_draft_results SET status='uncertain',updated_at='2020-01-01' WHERE request_key='key0'");
  assert.equal(claim.get('key0','owner','renewed','client0',20,pending),undefined);
  assert.equal(claim.get('new','owner','batch','new',20,pending),undefined);
  db.exec("UPDATE printify_draft_results SET status='failed' WHERE request_key='key1'");
  assert.ok(claim.get('key1','owner','renewed','client1',20,pending));
  assert.equal(claim.get('key1','intruder','batch','client1',20,pending),undefined);
  db.close();
});
test('private job checkpoints cannot be read through another owner or job prefix',async()=>{
  const values=new Map(),bucket={put:async(key,bytes,options)=>values.set(key,{bytes,...options}),get:async key=>{const v=values.get(key);return v?{arrayBuffer:async()=>v.bytes.buffer,customMetadata:v.customMetadata}:null}};
  const key=await writeJobObject(bucket,'owner','job','input.json',{design:'a'});
  assert.deepEqual(await readJobObject(bucket,'owner','job',key),{design:'a'});
  await assert.rejects(readJobObject(bucket,'other','job',key),/owner/);
  await assert.rejects(readJobObject(bucket,'owner','other',key),/owner/);
  assert.equal(pendingDraftJob('{'),null);assert.equal(pendingDraftJob(JSON.stringify({id:'a'})),null);
});
test('reconciliation is read-only and rejects lookalikes from the same uploaded design',async()=>{
  const key=await draftCreationKey('owner',1,'template','design'),expected={key,shopId:1,blueprintId:2,providerId:3,variantIds:[10]};
  const exact={id:'right',shop_id:1,blueprint_id:2,print_provider_id:3,variants:[{id:10,sku:draftVariantSku(key,10)}]};
  let calls=0;
  const found=await reconcileDraftJob(expected,'fake',async(url,init)=>{calls++;assert.equal(init.method,undefined);assert.match(String(url),/limit=50&page=1/);return Response.json({data:[...Array.from({length:49},(_,n)=>({...exact,id:'wrong'+n,variants:[{id:10,sku:'other-job'}]})),exact],last_page:200})});
  assert.equal(found.id,'right');assert.equal(calls,1);
});
