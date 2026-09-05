import test from 'node:test';
import assert from 'node:assert/strict';
import {draftCreationKey,draftVariantSku,belongsToCreation} from '../app/api/printify/draft-identity.ts';
test('draft identity survives session renewal but separates owners, shops, products and designs',async()=>{
  const base=await draftCreationKey('owner',1,'template','design');
  assert.equal(await draftCreationKey('owner',1,'template','design'),base);
  for(const args of [['other',1,'template','design'],['owner',2,'template','design'],['owner',1,'other','design'],['owner',1,'template','other']])assert.notEqual(await draftCreationKey(...args),base);
  assert.notEqual(await draftCreationKey('a:b',1,'c','d'),await draftCreationKey('a',1,'b:c','d'));
});
test('recovery requires exact job SKUs, shop, blueprint, provider and every expected variant',async()=>{
  const key=await draftCreationKey('owner',1,'template','design');
  const expected={key,shopId:1,blueprintId:2,providerId:3,variantIds:[10,20]};
  const product={shop_id:1,blueprint_id:2,print_provider_id:3,variants:[10,20].map(id=>({id,sku:draftVariantSku(key,id)}))};
  assert.ok(belongsToCreation(product,expected));
  assert.ok(draftVariantSku(key,10).length<64);
  for(const changed of [{shop_id:2},{blueprint_id:3},{print_provider_id:4},{variants:product.variants.slice(0,1)},{variants:[{id:10,sku:'same-artwork-different-job'},{id:20,sku:product.variants[1].sku}]}])assert.equal(belongsToCreation({...product,...changed},expected),false);
  assert.equal(belongsToCreation(product,{...expected,variantIds:[]}),false);
});
