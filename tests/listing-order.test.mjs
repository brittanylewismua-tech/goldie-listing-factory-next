import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {draftsInDesignOrder} from '../app/listing-order.ts';
import {createProductWithImageRetries} from '../app/api/printify/product-creation.ts';
test('parallel completion, reload and retry keep the upload order',()=>{
  const files=[{id:'red'},{id:'pink'}],results=[{clientId:'pink',id:'second'},{clientId:'red',id:'first'}];
  assert.deepEqual(draftsInDesignOrder(results,files).map(d=>d.id),['first','second']);
  assert.deepEqual(results.map(d=>d.id),['second','first']);
  assert.deepEqual(draftsInDesignOrder([{clientId:'pink',status:'Created'},{clientId:'red',status:'Failed'}],files).map(d=>d.clientId),['red','pink']);
});
test('unknown legacy drafts retain their stable order without displacing known designs',()=>{
  assert.deepEqual(draftsInDesignOrder([{clientId:'old-a'},{clientId:'pink'},{clientId:'old-b'},{clientId:'red'}],[{id:'red'},{id:'pink'}]).map(d=>d.clientId),['red','pink','old-a','old-b']);
});
test('every active editor reads the same memoized order and final review follows bundle order',()=>{
  const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
  assert.match(source,/const drafts=useMemo\(\(\)=>draftsInDesignOrder\(draftResults,files\),\[draftResults,files\]\)/);
  const block=source.slice(source.indexOf('function bundlePublishDrafts()'),source.indexOf('function costReviewDrafts()'));
  assert.match(block,/return bundleRecipes.flatMap/);
  assert.match(block,/draftsInDesignOrder\(member.drafts,member.designs\)/);
});
test('two definite image rejections make only two requests, one reupload and one propagation wait',async()=>{
  let requests=0,reuploads=0;const waits=[];
  await assert.rejects(createProductWithImageRetries({path:'/shops/1/products.json',token:'test',body:'{}',fetcher:async()=>{requests++;return new Response(JSON.stringify({code:8253}),{status:400})},sleeper:async ms=>{waits.push(ms)},onImageNotReady:async()=>{reuploads++}}),/rejected the images/);
  assert.equal(requests,2);assert.equal(reuploads,1);assert.deepEqual(waits,[3000]);
});
