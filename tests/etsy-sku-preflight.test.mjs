import test from 'node:test';import assert from 'node:assert/strict';
import {prepareEtsySkus} from '../app/api/printify/etsy-sku-preflight.ts';
import {draftVariantSku} from '../app/api/printify/draft-identity.ts';
const key='a'.repeat(64),legacy=id=>`LF-${key.slice(0,32)}-${id}`;
const variants=[{id:11,sku:legacy(11),price:3204,is_enabled:true},{id:12,sku:'SELLER-CUSTOM',price:3655,is_enabled:false}];
test('only exact owned legacy SKUs change; prices, membership and seller SKUs survive readback',async()=>{
 let product={variants},calls=[];
 await prepareEtsySkus(123,'qa',key,'token',async(url,init)=>{calls.push(init.method||'GET');assert.equal(url,'https://api.printify.com/v1/shops/123/products/qa.json');if(init.method==='PUT'){const body=JSON.parse(init.body);assert.deepEqual(Object.keys(body),['variants']);assert.deepEqual(body.variants,[{...variants[0],sku:draftVariantSku(key,11)},variants[1]]);product=body;}return Response.json(product)});
 assert.deepEqual(calls,['GET','PUT','GET']);
});
test('published, locked, unrelated and already-short SKUs never receive a PUT',async()=>{
 for(const [product,identity,throws] of [[{external:{id:456},variants},key,false],[{is_locked:true,variants},key,true],[{variants},'b'.repeat(64),true],[{variants:[{...variants[0],sku:'short'}]},'legacy-request-key',false]]){
  let calls=0;const run=()=>prepareEtsySkus(123,'qa',identity,'token',async(url,init)=>{calls++;assert.notEqual(init.method,'PUT');return Response.json(product)});
  if(throws)await assert.rejects(run());else await run();assert.equal(calls,1);
 }
});
test('uncertain SKU writes are not replayed; retry first reads the actual saved values',async()=>{
 let product={variants},puts=0;const fetcher=async(url,init)=>{if(init.method==='PUT'){puts++;product=JSON.parse(init.body);throw Error('lost response')}return Response.json(product)};
 await assert.rejects(prepareEtsySkus(123,'qa',key,'token',fetcher));
 await prepareEtsySkus(123,'qa',key,'token',fetcher);assert.equal(puts,1);
});
test('readback discrepancy blocks handoff rather than claiming a successful repair',async()=>{
 let reads=0;await assert.rejects(prepareEtsySkus(123,'qa',key,'token',async(url,init)=>{if(init.method==='PUT')return Response.json({});reads++;return Response.json({variants:reads===1?variants:[{...variants[0],price:9999}]})}),/need review/);
});
