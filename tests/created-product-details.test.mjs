import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {completeCreatedProduct, CREATED_DETAILS_TIMEOUT_MS} from '../app/api/printify/created-product-details.ts';
const complete={id:'draft-1',images:[{src:'photo'}],print_areas:[{placeholders:[{images:[{x:0.4,scale:0.6}]}]}]};
test('complete creation responses need no extra Printify request',async()=>{
  assert.equal(await completeCreatedProduct(complete,1,'test',async()=>{throw Error('unexpected call')}),complete);
});
test('one read fills BOTH missing preview and placement',async()=>{
  let calls=0;
  const result=await completeCreatedProduct({id:'draft-1'},1,'test',async(url,init)=>{
    calls++;assert.match(url,/\/shops\/1\/products\/draft-1.json$/);assert.equal(init.method,'GET');
    return Response.json(complete);
  });
  assert.equal(calls,1);assert.deepEqual(result,complete);
});
for(const status of [400,401,403,404,429,500,503]) test(`optional details ${status} never retries or loses created draft`,async()=>{
  const created={id:'draft-1'};let calls=0;
  assert.equal(await completeCreatedProduct(created,1,'test',async()=>{calls++;return new Response('no',{status});}),created);
  assert.equal(calls,1);
});
test('even a stalled body cannot hold the completed draft beyond the short deadline',async()=>{
  const created={id:'draft-1'};let signal;
  const start=performance.now();
  const result=await completeCreatedProduct(created,1,'test',async(_url,init)=>{
    signal=init.signal;return new Response(new ReadableStream({start(){}}));
  },20);
  assert.equal(result,created);assert.equal(signal.aborted,true);
  assert.ok(performance.now()-start<1000);assert.equal(CREATED_DETAILS_TIMEOUT_MS,2000);
});
test('incomplete or wrong-product responses cannot replace valid existing metadata',async()=>{
  const created={id:'draft-1',images:[{src:'already-present'}]};
  assert.equal(await completeCreatedProduct(created,1,'test',async()=>Response.json({...complete,id:'other'})),created);
  assert.deepEqual((await completeCreatedProduct(created,1,'test',async()=>Response.json({id:'draft-1',images:[]}))).images,created.images);
  assert.equal(await completeCreatedProduct(created,1,'test',async()=>new Response('{')),created);
});
test('actual draft route has one bounded hydration call and no long post-creation GET ladder',()=>{
  const source=readFileSync(new URL('../app/api/printify/drafts/route.ts',import.meta.url),'utf8');
  const finalization=source.slice(source.indexOf('const resolvedProduct='),source.indexOf('const totalMs='));
  assert.equal((finalization.match(/completeCreatedProduct\(/g)||[]).length,1);
  assert.doesNotMatch(finalization,/await api</);
});
