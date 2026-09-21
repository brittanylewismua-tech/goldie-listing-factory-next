import test from 'node:test';
import assert from 'node:assert/strict';
import {offerEconomics,comparablePrices,shippingScenario} from '../app/offer-economics.ts';
import {catalogActions} from '../app/shop-map-actions.ts';
import {buyerAction} from '../app/buyer-actions.ts';
import {validPlan} from '../app/command-center-plan.ts';
import {monthWindow} from '../app/finance-month.ts';

test('price floor survives discounts, ad fees and paid shipping',()=>{
 const v={price:25,discount:20,shippingCharged:4,production:12,shippingCost:5,feePercent:10,fixedFees:.45,adPercent:15,target:5};
 const x=offerEconomics(v);assert.equal(x.contribution,.5500000000000007);assert.equal(x.targetMet,false);
 const floor=offerEconomics({...v,price:x.minimumPrice});assert.ok(floor.contribution>=5);assert.ok(offerEconomics({...v,price:x.minimumPrice-.01}).contribution<5);
 assert.equal(offerEconomics({...v,discount:100}),null);assert.equal(offerEconomics({...v,production:NaN}),null);assert.equal(offerEconomics({...v,adPercent:90}),null);
});
test('comparison sample excludes stale data and refuses mixed currencies',()=>{
 const row={currency:'USD',displayFresh:true,priceCents:2000};
 assert.equal(comparablePrices([row,row]),null);
 assert.equal(comparablePrices([row,row,{...row,currency:'GBP'}]),null);
 assert.deepEqual(comparablePrices([row,{...row,priceCents:3000},{...row,priceCents:2500},{...row,priceCents:1,displayFresh:false}]),{currency:'USD',count:3,min:2000,max:3000,median:2500});
});
test('catalog actions distinguish unavailable sellers from low-volume noise',()=>{
 const now=1800000000,day=86400;
 const listing=(id,state='active')=>({listing_id:id,title:`Item ${id}`,state,created_at:now-100*day,favorites:10});
 const sale=(id,q,days)=>({listing_id:id,quantity:q,sold_at:now-days*day,refunded:0});
 const result=catalogActions([listing(1,'inactive'),listing(2),listing(3),listing(4)], [sale(1,2,20),sale(2,6,40),sale(2,1,10),sale(3,1,40),{...sale(4,1,10),refunded:1}],now);
 assert.deepEqual(result.map(r=>r.listingId),[1,2,4]);assert.match(result[2].evidence,/lifetime favorites/);
 assert.equal(catalogActions([{...listing(5),created_at:now-5*day}],[],now).length,0);
});
test('buyer suggestions require recognized evidence and avoid claims of certainty',()=>{
 assert.equal(buyerAction('random invented topic'),null);assert.match(buyerAction('runs small').check,/exact blank/);assert.match(buyerAction('faded').check,/wash-test/);
});
test('saved plans reject oversized and missing fields',()=>{
 assert.equal(validPlan({title:'',notes:'',outcome:'',status:'planned'}),null);
 assert.equal(validPlan({title:'Test',notes:'x'.repeat(6001),outcome:'',status:'planned'}),null);
 assert.equal(validPlan({title:'Test',notes:'',outcome:'',status:'published'}),null);
 assert.equal(validPlan({title:' Test ',notes:'one change',outcome:'',status:'testing'}).title,'Test');
});
test('month boundaries reject overflow and account for daylight saving',()=>{
 assert.equal(monthWindow('2026-13','America/Los_Angeles'),null);assert.equal(monthWindow('2026-00','America/Los_Angeles'),null);
 const w=monthWindow('2026-03','America/Los_Angeles');assert.equal(new Date(w.from*1000).toISOString(),'2026-03-01T08:00:00.000Z');assert.equal(new Date((w.to+1)*1000).toISOString(),'2026-04-01T07:00:00.000Z');
});

 test('print fit uses original pixels and preserves aspect ratio',async()=>{
 const {printFit}=await import('../app/print-fit.ts');
 assert.deepEqual(printFit(3600,4800,12,300),{heightInches:16,effectivePpi:300,maxWidth:12,maxHeight:16,meets:true});
 assert.equal(printFit(768,1024,12,300).meets,false);
 assert.equal(printFit(3600,4800,0,300),null);
 });

test('overlapping shipping rates use the higher cost and preserve the range',()=>{
 const profile=(cost,currency='USD',countries=['US'])=>({variant_ids:[12],countries,first_item:{cost,currency}});
 assert.deepEqual(shippingScenario([profile(799),profile(879)],12,'US'),{minimum:799,cost:879,currency:'USD'});
 assert.deepEqual(shippingScenario([profile(799),profile(1599,'USD',['REST_OF_THE_WORLD'])],12,'US'),{minimum:799,cost:799,currency:'USD'});
 assert.deepEqual(shippingScenario([profile(1599,'USD',['REST_OF_THE_WORLD'])],12,'CA'),{minimum:1599,cost:1599,currency:'USD'});
 assert.equal(shippingScenario([profile(799),profile(879,'CAD')],12,'US'),null);
 assert.equal(shippingScenario([profile(-1)],12,'US'),null);
 assert.equal(shippingScenario([profile(799)],13,'US'),null);
 const quality=buyerAction('great quality');assert.match(quality.change,/paper products/);assert.match(quality.change,/For apparel/);
});
