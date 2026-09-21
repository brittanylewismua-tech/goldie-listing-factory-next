import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {refreshShopFinances} from '../app/refresh-shop-finances.ts';

test('financial refresh finishes pending windows before matching production costs', async () => {
  const calls=[];
  const replies=[{complete:false,errors:[],ledger:{windowsOutstanding:2}}, {complete:true}, {}];
  await refreshShopFinances(async (url,init)=>{
    calls.push(url); assert.equal(init.method,'POST');
    return Response.json(replies.shift());
  });
  assert.equal(calls.length,3);
  assert.ok(calls[0].includes('/financial/ingest'));
  assert.ok(calls[1].includes('/financial/ingest'));
  assert.equal(calls[2],'/api/shop-map/financial/reconcile');
});

test('failed or partial financial imports never report successful refresh', async () => {
  for(const [body,status] of [
    [{error:'Reconnect Etsy'},403],
    [{complete:false,errors:['Etsy receipts returned 429']},200],
    [{complete:false,errors:[],ledger:{windowsOutstanding:0}},200],
  ]){
    let calls=0;
    await assert.rejects(refreshShopFinances(async()=>{calls++;return Response.json(body,{status});}));
    assert.equal(calls,1);
  }
  let calls=0;
  await assert.rejects(refreshShopFinances(async()=>{calls++;return Response.json({complete:false,errors:[],ledger:{windowsOutstanding:1}});}),/Refresh again/);
  assert.equal(calls,4);
});

test('a failed reconciliation is not a successful financial refresh', async () => {
  let calls=0;
  await assert.rejects(refreshShopFinances(async()=>++calls===1?Response.json({complete:true}):Response.json({error:'Matching failed'},{status:500})),/Matching failed/);
});

test('financial write routes authenticate members and take identity from their active connection',()=>{
  for(const name of ['ingest','reconcile']){
    const source=readFileSync(new URL(`../app/api/shop-map/financial/${name}/route.ts`,import.meta.url),'utf8');
    assert.match(source,/crossSiteWrite\(request\)/);
    assert.match(source,/if \(!user\)/);
    assert.doesNotMatch(source,/isOwner\(user\)/);
    assert.doesNotMatch(source,/parameters\.get\(["'](?:user|shop)/);
    assert.match(source,/\.bind\(user\.userId, shopId/);
  }
});
