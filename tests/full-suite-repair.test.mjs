import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = path => readFileSync(new URL(`../app/${path}`,import.meta.url),'utf8');
test('a failed month change cannot display another month’s money',()=>{
 const page=read('shop-map/shop-map-client.tsx');
 assert.match(page,/selectedMonth && shown.month!==selectedMonth/);
 assert.match(page,/This month could not be loaded/);
});
test('tracked shop pages keep watch authorization, bounded offsets, and deduplication',()=>{
 const route=read('api/shop-watch/listings/route.ts');
 assert.match(route,/user_id=\? AND shop_id=\? AND paused=0/);
 assert.match(route,/Number.isSafeInteger\(offset\).*offset>12000/);
 assert.match(route,/limit=\$\{limit\}&offset=\$\{offset\}/);
 assert.match(route,/offset===0&&cached/);
 assert.match(route,/nextOffset:returned>0/);
 const page=read('market-watch/market-watch-client.tsx');
 assert.match(page,/new Map\(\[\.\.\.old/);
 assert.match(page,/Load more listings/);
});
test('empty keyword search results do not include the unfiltered catalog',()=>{
 const page=read('hot-list/page.tsx');
 assert.match(page,/hits === null && <>/);
 assert.ok(page.indexOf('hits === null && <>')<page.indexOf('shown.map(listing'));
 assert.match(page,/setHits\(\[\]\); setSearchedTerm/);
});
test('manual cost confirmation requires a valid amount',()=>{
 const page=read('shop-map/costs/costs-client.tsx');
 const expression=page.match(/const validAmount = (.+);/)[1];
 const valid= new Function('amount',`return ${expression}`);
 for(const amount of ['abc','-1','Infinity','1e3','12.345','100000.01',''])assert.equal(valid(amount),false,amount);
 for(const amount of ['0','12','12.34',' 12.34 ','100000'])assert.equal(valid(amount),true,amount);
 assert.match(page,/disabled=\{!validAmount\}/);
});
