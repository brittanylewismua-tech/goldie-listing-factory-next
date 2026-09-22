import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {keywordSearchParams,keywordNextOffset,orderedSearchDetails} from '../app/keyword-search.ts';
test('newest queries Etsy by creation across keyword matches, not a saved relevance pool',()=>{
 const params=keywordSearchParams('Bachelorette','newest',24,'shirt');
 assert.equal(params.get('keywords'),'Bachelorette shirt');
 assert.equal(params.get('sort_on'),'created');assert.equal(params.get('sort_order'),'desc');
 assert.equal(params.get('offset'),'24');assert.equal(params.get('limit'),'24');
 assert.equal(keywordSearchParams('bachelorette','relevance',0).get('sort_on'),'score');
});
test('pagination advances using raw results, not the hydrated or filtered card count',()=>{
 assert.equal(keywordNextOffset(0,24,98321),24);
 assert.equal(keywordNextOffset(24,24,98321),48);
 assert.equal(keywordNextOffset(48,3,51),null);
 assert.equal(keywordNextOffset(48,0,100),null);
 assert.equal(keywordNextOffset(0,24,null),24);
});
test('hydration preserves source order and missing records without substituting saved candidates',()=>{
 const rows=[{listing_id:8,creation_timestamp:900,original_creation_timestamp:50},{listing_id:2,creation_timestamp:800},{listing_id:3,creation_timestamp:700}];
 const details=new Map([[2,{listing_id:2,title:'Second'}],[8,{listing_id:8,title:'First'}]]);
 const actual=orderedSearchDetails(rows,details);
 assert.deepEqual(actual.map(row=>row.listing_id),[8,2,3]);
 assert.equal(actual[0].creation_timestamp,900);assert.equal(actual[0].original_creation_timestamp,50);
 assert.equal(actual[2].creation_timestamp,700);
});
test('live search requires the feature and a member-owned saved keyword, and exposes upstream failure',()=>{
 const route=readFileSync(new URL('../app/api/market-watch/listings/route.ts',import.meta.url),'utf8');
 assert.match(route,/requireFeatureApi\('marketWatch'\)/);
 assert.match(route,/watchesFor\(access.user.userId\)/);
 assert.match(route,/if\(!watch\).*status:404/);
 assert.match(route,/status:502/);
 assert.doesNotMatch(route,/readNiche|addCandidates|relates\(/);
 assert.match(route,/reviewsOnThisListing:null/);
});
test('keyword UI cannot silently sort a saved pool as newest or retain results across changed searches',()=>{
 const client=readFileSync(new URL('../app/market-watch/market-watch-client.tsx',import.meta.url),'utf8');
 const detail=client.slice(client.indexOf('function NicheDetail'),client.indexOf('function ListingCard'));
 assert.match(detail,/api\/market-watch\/listings/);assert.doesNotMatch(detail,/view.listings/);
 assert.match(detail,/Compare loaded listings/);assert.match(detail,/controller.signal.aborted/);
 assert.match(detail,/setRows\(\[\]\)/);assert.doesNotMatch(client,/About these numbers/);
});
