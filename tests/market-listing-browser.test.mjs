import test from 'node:test';
import assert from 'node:assert/strict';
import {browseListings} from '../app/market-listing-browser.ts';
const row=(id,changes={})=>({listingId:id,title:'Feminist shirt',currency:'USD',priceCents:2000,favorites:0,views:0,ageDays:10,reviewsOnThisListing:0,...changes});
test('favorites and views sort numerically with absent measurements last',()=>{
 const rows=[row(1,{favorites:null,views:null}),row(2,{favorites:9,views:100}),row(3,{favorites:100,views:9}),row(4)];
 assert.deepEqual(browseListings(rows,'favorites').map(l=>l.listingId),[3,2,4,1]);
 assert.deepEqual(browseListings(rows,'views').map(l=>l.listingId),[2,3,4,1]);
 assert.deepEqual(rows.map(l=>l.listingId),[1,2,3,4]);
});
test('newest uses original timestamps, falls back to age, and keeps unknown dates last',()=>{
 assert.deepEqual(browseListings([row(1,{createdAt:100}),row(2,{createdAt:200}),row(3,{ageDays:null})],'newest').map(l=>l.listingId),[2,1,3]);
 assert.deepEqual(browseListings([row(1,{ageDays:20}),row(2,{ageDays:1}),row(3,{ageDays:null})],'newest').map(l=>l.listingId),[2,1,3]);
});
test('search matches every word, ignores case, and combines with currency',()=>{
 const rows=[row(1),row(2,{title:'Feminist sweatshirt',currency:'GBP'}),row(3,{title:'Cat shirt'})];
 assert.deepEqual(browseListings(rows,'newest','SHIRT feminist','USD').map(l=>l.listingId),[1]);
 assert.equal(browseListings(rows,'newest','nonexistent').length,0);
});
test('price orders retain missing-last behavior and cannot rank mixed currencies',()=>{
 const rows=[row(1,{priceCents:5000}),row(2,{priceCents:1000}),row(3,{priceCents:null})];
 assert.deepEqual(browseListings(rows,'price').map(l=>l.listingId),[2,1,3]);
 assert.deepEqual(browseListings(rows,'price-desc').map(l=>l.listingId),[1,2,3]);
 assert.deepEqual(browseListings([row(1,{priceCents:5000}),row(2,{priceCents:1,currency:'GBP'})],'price').map(l=>l.listingId),[1,2]);
});
test('newly loaded higher-ranked records participate in the whole loaded comparison',()=>{
 const first=[row(1,{favorites:5}),row(2,{favorites:10})];
 const next=[row(3,{favorites:500})];
 assert.deepEqual(browseListings([...first,...next],'favorites').map(l=>l.listingId),[3,2,1]);
});
test('own-shop filters keep inactive listings distinct and sort actual units and revenue',async()=>{
 const {browseOwnListings}=await import('../app/market-listing-browser.ts');
 const rows=[{listingId:1,title:'Cat shirt',sales:3,favorites:100,revenueMinor:6000,state:'active'},{listingId:2,title:'Cat mug',sales:5,favorites:10,revenueMinor:5000,state:'draft'},{listingId:3,title:'Dog shirt',sales:1,favorites:null,revenueMinor:9000,state:'active'}];
 assert.deepEqual(browseOwnListings(rows,'sales').map(l=>l.listingId),[2,1,3]);
 assert.deepEqual(browseOwnListings(rows,'revenue').map(l=>l.listingId),[3,1,2]);
 assert.deepEqual(browseOwnListings(rows,'favorites','cat','active').map(l=>l.listingId),[1]);
 assert.deepEqual(browseOwnListings(rows,'sales','','inactive').map(l=>l.listingId),[2]);
 assert.equal(browseOwnListings(rows,'sales','missing').length,0);
});
