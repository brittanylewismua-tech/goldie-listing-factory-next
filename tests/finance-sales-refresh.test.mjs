import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {etsySaleValues} from '../app/etsy-sale-values.ts';
import ts from 'typescript';
const source=readFileSync(new URL('../app/api/shop-map/financial/ingest/route.ts',import.meta.url),'utf8');
const block=source.slice(source.indexOf('      for (const line of (receipt.transactions'),source.indexOf('\n    }\n    for (let offset',source.indexOf('      for (const line of (receipt.transactions')));
const run=new Function('receipt','etsySaleValues',ts.transpile(`
const receiptWrites:any[]=[]; let transactionsStored=0;
const user={userId:'member-a'}, shopId=123, now=1800000000, receiptId=456;
const status=String(receipt.status??''),refunds=receipt.refunds??[];
const decodeEntities=(v:string)=>v;
const db={prepare:(sql:string)=>({bind:(...values:unknown[])=>({sql,values})})};
${block}
return {receiptWrites,transactionsStored};`));
const transaction={transaction_id:10,listing_id:20,quantity:2,title:'Test tee',price:{amount:22,divisor:1,currency_code:'USD'}};
test('money refresh imports each paid line with actual price and date for the same member and shop',()=>{
 const r=run({is_paid:true,created_timestamp:1799999900,transactions:[transaction]},etsySaleValues);
 assert.equal(r.transactionsStored,1);
 const sale=r.receiptWrites.find(x=>x.sql.includes('INSERT INTO shop_map_listing_sales'));
 assert.deepEqual(sale.values,['member-a',123,20,10,456,2,2200,'USD',1799999900,0]);
 assert.match(sale.sql,/ON CONFLICT\(user_id,shop_id,transaction_id\) DO UPDATE/);
 const catalog=r.receiptWrites.find(x=>x.sql.includes('INSERT INTO shop_map_listings'));
 assert.match(catalog.sql,/DO NOTHING/);
 assert.equal(catalog.values[3],'Test tee');
});
test('canceled receipts invalidate previous sales and do not add new ones',()=>{
 for(const status of ['canceled','cancelled']){
  const r=run({is_paid:true,status,created_timestamp:1799999900,transactions:[transaction]},etsySaleValues);
  assert.equal(r.transactionsStored,0);
  assert.match(r.receiptWrites[0].sql,/UPDATE shop_map_listing_sales SET refunded=1/);
  assert.deepEqual(r.receiptWrites[0].values,['member-a',123,10]);
 }
});
test('refunds are retained and malformed transactions never become sales',()=>{
 const r=run({is_paid:true,created_timestamp:1799999900,refunds:[{}],transactions:[transaction,{...transaction,transaction_id:0},{...transaction,listing_id:-1}]},etsySaleValues);
 assert.equal(r.transactionsStored,1); assert.equal(r.receiptWrites[0].values.at(-1),1);
});
