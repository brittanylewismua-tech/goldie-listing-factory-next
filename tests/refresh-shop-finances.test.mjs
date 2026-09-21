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
    assert.match(source,/requireFeatureApi\("shopMap"\)/);
    assert.match(source,/if \(!access.ok\) return access.response/);
    assert.doesNotMatch(source,/isOwner\(user\)/);
    assert.doesNotMatch(source,/parameters\.get\(["'](?:user|shop)/);
    assert.match(source,/\.bind\(user\.userId, shopId/);
  }
});

test('financial refresh has a bounded request and explains a timeout',async()=>{
  await assert.rejects(refreshShopFinances(async(url,init)=>{
    assert.ok(init.signal instanceof AbortSignal);
    throw new DOMException('timeout','TimeoutError');
  }),/took too long/);
});

test('receipt refresh corrects source amounts and dates while preserving order matching',async()=>{
  const {DatabaseSync}=await import('node:sqlite');
  const db=new DatabaseSync(':memory:');
  try {
    const schema=readFileSync(new URL('../app/finance-store.ts',import.meta.url),'utf8').match(/`(CREATE TABLE IF NOT EXISTS finance_receipts[\s\S]*?)`/)[1];
    const sql=readFileSync(new URL('../app/api/shop-map/financial/ingest/route.ts',import.meta.url),'utf8').match(/`(INSERT INTO finance_receipts[\s\S]*?)`/)[1];
    db.exec(schema);
    db.prepare(sql).run('member',1,100,900000,0,0,0,0,900000,100,'USD',0,0,100,100,100);
    db.exec("UPDATE finance_receipts SET match_status='fully-matched',safe_for_profit=1");
    db.prepare(sql).run('member',1,100,2200,300,0,0,0,2500,100,'USD',0,0,200,300,400);
    const row=db.prepare('SELECT * FROM finance_receipts').get();
    assert.equal(row.subtotal_minor+row.shipping_minor,2500);
    assert.equal(row.source_created_at,200);
    assert.equal(row.ingested_at,400);
    assert.equal(row.match_status,'fully-matched');
    assert.equal(row.safe_for_profit,1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM finance_receipts').get().n,1);
  } finally {db.close();}
});
