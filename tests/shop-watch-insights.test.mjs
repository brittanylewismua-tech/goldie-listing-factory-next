import test from 'node:test';
import assert from 'node:assert/strict';
import {listingReading,listingChanges,shopActivity} from '../app/shop-watch-insights.ts';
const reading=(over={})=>({id:1,title:'Original tee',price:2400,currency:'USD',tags:['gift','tee'],createdAt:100,at:200,...over});
test('price/title/tag edits preserve before and after without treating old listings as launches',()=>{
 assert.deepEqual(listingChanges(null,reading(),150),[]);
 const changes=listingChanges(reading(),reading({at:300,price:2200,title:'New title',tags:['tee','women']}),150);
 assert.deepEqual(changes.map(c=>c.kind),['price','title','tags']);
 assert.equal(changes[0].before,'2400');assert.equal(changes[0].after,'2200');
 assert.equal(listingChanges(null,reading({createdAt:180}),150)[0].kind,'new');
});
test('repeated or stale observations and currency changes do not invent events',()=>{
 assert.deepEqual(listingChanges(reading(),reading(),100),[]);
 assert.deepEqual(listingChanges(reading(),reading({at:190,price:4000}),100),[]);
 assert.deepEqual(listingChanges(reading(),reading({at:300,price:4000,currency:'CAD'}),100),[]);
});
test('API readings normalize prices and tag order',()=>{
 assert.equal(listingReading({listing_id:1,title:'Tee',price:{amount:2499,divisor:100,currency_code:'USD'},tags:['b','a','a']},123).price,2499);
 assert.deepEqual(listingReading({listing_id:1,title:'Tee',tags:['b','a','a']},123).tags,['a','b']);
 assert.equal(listingReading({listing_id:1},123),null);
});
test('activity retains observed ranges and does not invent daily numbers or ignore counter resets',()=>{
 const now=30*86400,rows=[{at:now-5*86400,sales:100,favorites:20,active:10},{at:now-2*86400,sales:110,favorites:23,active:12}];
 const a=shopActivity(rows,7,now);assert.equal(a.sales,10);assert.equal(a.series.length,1);assert.equal(a.series[0].to-a.series[0].from,3*86400);
 assert.equal(shopActivity([rows[0]],7,now).sales,null);
 assert.equal(shopActivity([...rows,{...rows[1],at:now,sales:99}],7,now).sales,null);
});
test('missing tags never look like tag removals',()=>{
 assert.equal(listingReading({listing_id:1,title:'Tee'},300).tags,null);
 assert.deepEqual(listingChanges(reading(),reading({at:300,tags:null}),100),[]);
});
