import test from 'node:test';
import assert from 'node:assert/strict';
import {recordCompetitorChanges,competitorChanges} from '../app/market-collection.ts';
const base={listingId:1,title:'Cat shirt',tags:['cat','shirt'],currency:'USD',priceCents:2000,favorites:100,views:500};
test('a price cut and restoration remain two dated edits even when net price change is zero',()=>{
 const cut=recordCompetitorChanges(base,{...base,priceCents:1500},100);
 const restored=recordCompetitorChanges(cut,{...base},200);
 assert.deepEqual(restored.history.map(h=>[h.at,h.before,h.after]),[[100,'2000','1500'],[200,'1500','2000']]);
 assert.equal(competitorChanges({listing:restored,baseline:base}).priceCents,0);
});
test('a refresh without an edit creates no event, and tag order does not create a false change',()=>{
 assert.deepEqual(recordCompetitorChanges(base,{...base,tags:['shirt','cat']},100).history,[]);
});
test('a missing old tag list or changed currency cannot invent an edit',()=>{
 const next=recordCompetitorChanges({...base,tags:undefined},{...base,currency:'GBP',priceCents:1600},100);
 assert.deepEqual(next.history,[]);
});
test('real title and tag changes retain the exact before and after values',()=>{
 const next=recordCompetitorChanges(base,{...base,title:'Cat mom shirt',tags:['cat mom','shirt']},100);
 assert.deepEqual(next.history.map(h=>h.kind),['title','tags']);assert.equal(next.history[0].before,base.title);assert.equal(next.history[0].after,'Cat mom shirt');
});
test('history keeps at most 60 edits within 90 days without mutating the saved baseline',()=>{
 const held={...base,history:Array.from({length:70},(_,i)=>({at:i,kind:'title',before:'a',after:'b',currency:'USD'}))};
 assert.equal(recordCompetitorChanges(held,base,100).history.length,60);assert.equal(held.history.length,70);
 assert.equal(recordCompetitorChanges(held,base,91*86400).history.length,0);
});
