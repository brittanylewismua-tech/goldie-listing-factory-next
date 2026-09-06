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

test('generated SKUs fit Etsy’s 32-character limit including the largest valid variant identity',async()=>{
 const key=await draftCreationKey('owner',1,'template','design');
 const ids=[1,10,12124,Number.MAX_SAFE_INTEGER];
 const skus=ids.map(id=>draftVariantSku(key,id));
 assert.equal(new Set(skus).size,ids.length);
 for(const sku of skus){assert.ok(sku.length<=32);assert.match(sku,/^[A-Za-z0-9_-]+$/)}
});
test('legacy identity remains recoverable and conversion preserves seller SKUs',async()=>{
 const {compatibleLegacySku}=await import('../app/api/printify/draft-identity.ts');
 const key=await draftCreationKey('owner',1,'template','design'),legacy=`LF-${key.slice(0,32)}-12124`;
 assert.equal(compatibleLegacySku(legacy,12124),draftVariantSku(key,12124));
 assert.equal(compatibleLegacySku(legacy,12125),legacy);
 assert.equal(compatibleLegacySku('MY-CUSTOM-SKU',12124),'MY-CUSTOM-SKU');
 assert.equal(compatibleLegacySku(undefined,12124),undefined);
 const expected={key,shopId:1,blueprintId:2,providerId:3,variantIds:[12124]};
 for(const sku of [legacy,draftVariantSku(key,12124)])assert.ok(belongsToCreation({shop_id:1,blueprint_id:2,print_provider_id:3,variants:[{id:12124,sku}]},expected));
});
