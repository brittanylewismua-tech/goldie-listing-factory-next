import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchesNiche,suggestedCluster,nicheMetrics,analyzeNiche,snapshot,compareSnapshots} from '../app/niche-research-model.ts';
const now=1800000000,day=86400;
function listing(id,shop=1,extra={}){return {id,shopId:shop,title:'Romance reader shirt',tags:['romance reader','book club'],image:'',displayAt:now,price:2500,currency:'USD',product:'tee',createdAt:now-5*day,seenAt:now,active:true,...extra};}
function shop(id=1){return {id,name:`Shop ${id}`,url:'',catalogOffset:20,catalogTotal:20,catalogDone:true,reviewOffset:10,reviewsDone:true,listings:Array.from({length:20},(_,i)=>listing(id*100+i,id)),reviews:Array.from({length:10},(_,i)=>({transactionId:id*100+i,listingId:id*100+i%3,at:now-i*day,rating:5,text:'Bought this for our book club and my friend'})),checkedAt:now,cycleAt:now,reviewSince:now-365*day};}
test('niche variants preserve the romance anchor and tolerate plurals and reordered product words',()=>{assert.equal(matchesNiche({title:'Shirts for romance book lovers',tags:[]},['romance book shirt']),true);assert.equal(matchesNiche({title:'Kids book shirt',tags:[]},suggestedCluster('romance reader shirt')),false);assert.equal(matchesNiche({title:'Random shirt',tags:[]},['']),false);assert(suggestedCluster('romance reader shirt').every(s=>s.includes('romance')));});
test('qualification requires completed catalogs and reviews; ten candidates is not ten qualified shops',()=>{const s=shop();assert(nicheMetrics(s,now).qualified);s.catalogDone=false;assert.equal(nicheMetrics(s,now).qualified,false);assert.equal(nicheMetrics(s,now).concentration,null);assert.equal(nicheMetrics(s,now).reviewsPrior90,null);});
test('review periods exclude future dates, unrelated listing IDs and duplicate transactions',()=>{const s=shop();s.reviews=[{transactionId:1,listingId:100,at:now-30*day,rating:5,text:''},{transactionId:2,listingId:100,at:now-90*day,rating:5,text:''},{transactionId:3,listingId:100,at:now+1,rating:5,text:''},{transactionId:4,listingId:999,at:now-1,rating:5,text:''}];s.reviews.push(s.reviews[0]);const m=nicheMetrics(s,now);assert.equal(m.reviews30,1);assert.equal(m.reviews90,2);assert.equal(m.reviewedListings,1);});
test('cross-shop evidence cannot be manufactured by duplicating a shop',()=>{const s=shop();const a=analyzeNiche([s,s],now);assert.equal(a.reviews30,10);assert.equal(a.phrases[0].shops,1);assert.equal(a.opportunities.length,0);const b=analyzeNiche([shop(1),shop(2),shop(3)],now);assert.equal(b.phrases[0].shops,3);assert(b.opportunities.length>0);});
test('prices stay in separate currencies and preserve cents',()=>{const s=shop();s.listings=[listing(100,1,{price:2500,currency:'USD'}),listing(101,1,{price:4000,currency:'EUR'})];const a=analyzeNiche([s],now);assert.equal(a.products[0].prices.length,2);assert.equal(a.products[0].prices.find(p=>p.currency==='USD').low,2500);});
test('buyer themes retain actual source listing IDs and do not include unrelated shop reviews',()=>{const s=shop();s.reviews.push({transactionId:999,listingId:999,at:now,rating:1,text:'Birthday birthday'});const b=analyzeNiche([s],now).buyerThemes;assert(b.some(p=>p.name==='Book clubs'));assert(!b.some(p=>p.name==='Birthdays'));assert(b.flatMap(p=>p.examples).every(r=>r.listingId>=100&&r.listingId<=102));});
test('change comparisons require the same shops and a genuine earlier observation',()=>{const s=shop(),old=snapshot([s],now-2*day),current=snapshot([s],now);assert(compareSnapshots([old],current));assert.equal(compareSnapshots([old],snapshot([shop(2)],now)),null);assert.equal(compareSnapshots([{...old,at:now-100}],current),null);});
test('collection continues beyond initial candidates and pages; scheduled work uses entitlement and leases',()=>{const e=readFileSync(new URL('../app/niche-research-engine.ts',import.meta.url),'utf8'),tick=readFileSync(new URL('../app/api/market/niche-research-tick/route.ts',import.meta.url),'utf8');assert.match(e,/qualified.length>=p.targetShops/);assert.match(e,/p.phase='discovering'/);assert.doesNotMatch(e,/catalogOffset<500|reviewOffset<500|slice\(0,10\).*candidates/);assert.match(tick,/await gate/);assert.match(tick,/claimResearch/);assert.match(tick,/writeResearch/);});

// Run the real collection state machine against paginated provider fixtures.
// No live Etsy credentials, user records, or network requests enter this test.
import ts from 'typescript';
import vm from 'node:vm';
import * as model from '../app/niche-research-model.ts';
function engine(pages){const calls=[];const writes=[];const code=ts.transpileModule(readFileSync(new URL('../app/niche-research-engine.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};const sandbox={exports,require(name){if(name.endsWith('niche-research-model'))return model;if(name.endsWith('niche-research-store'))return {putEvidence:async(...args)=>writes.push(args),cachedResearchPage:async()=>null,cacheResearchPage:async()=>{}};if(name.endsWith('product-type-utils'))return {productFamily:()=> 'tee'};if(name.endsWith('shop-map-worlds'))return {decodeEntities:s=>s};if(name.endsWith('shop-watch'))return {shopWatchRoom:async()=>2000};if(name.endsWith('etsy-listing-display'))return {listingPhoto:()=>'',listingPrice:r=>r.price?.amount??null};if(name.endsWith('/client'))return {etsyApiCredential:()=> 'test',recordEtsyCall:async()=>{},waitForEtsyCapacity:async()=>{},etsyBudget:async()=>({remaining:10000})};throw Error(name);},fetch:async url=>{calls.push(url);return {ok:true,json:async()=>pages(url)};},AbortSignal,Date,URLSearchParams,Map,Set,Math,Number,Error,Promise};vm.runInNewContext(code,sandbox);return {advance:exports.advanceResearch,reset:exports.resetShop,calls,writes};}
function project(){return {id:'test',name:'romance',phrases:['romance reader shirt'],createdAt:now,updatedAt:now,searchIndex:0,searchOffsets:[100],searchDone:[false],candidates:[],shops:[],selected:[],phase:'checking',monitoring:true,nextRun:now,cycleAt:now,history:[],lastDiscovery:now,callsToday:0,callDay:'',targetShops:10};}
test('catalog collection really advances past 500, then deactivates removed listings only at completion',async()=>{const p=project(),s=shop();s.catalogOffset=500;s.catalogDone=false;s.reviewsDone=false;s.checkedAt=0;s.cycleAt=Math.floor(Date.now()/1000);s.listings=[listing(999,1,{seenAt:1})];p.shops=[s];const e=engine(url=>{assert(url.includes('offset=500'));return {count:501,results:[{listing_id:123,title:'Romance reader shirt',tags:[],price:{amount:2500}}]};});await e.advance('member',p);assert.equal(s.catalogOffset,501);assert(s.catalogDone);assert.equal(s.listings.find(l=>l.id===999).active,false);assert.equal(s.listings.find(l=>l.id===123).active,true);assert(e.writes.length>0);});
test('ten unsuccessful candidates trigger further discovery rather than reporting ten qualified shops',async()=>{const p=project();p.shops=Array.from({length:10},(_,i)=>({...shop(i+1),reviews:[],checkedAt:now,cycleAt:now}));p.candidates=p.shops.map(s=>({id:s.id,hits:1}));const e=engine(()=>{throw Error('Should not call Etsy until next step');});await e.advance('member',p);assert.equal(p.phase,'discovering');assert.equal(p.selected.length,0);});
test('refresh resets catalog pagination but overlaps review dates for delayed indexing',()=>{const e=engine(()=>({results:[]})),s=shop();e.reset(s,now+6*3600);assert.equal(s.catalogOffset,0);assert.equal(s.reviewSince,now-7*day);assert.equal(s.checkedAt,now);assert.equal(s.reviews.length,10);assert.equal(s.catalogDone,false);});
test('provider failures do not advance the page cursor',async()=>{const p=project(),s=shop();s.catalogDone=false;s.checkedAt=0;p.shops=[s];const e=engine(()=>({unexpected:true}));await assert.rejects(()=>e.advance('member',p),/incomplete response/);assert.equal(s.catalogOffset,20);});
test('research budgets stop optional collection before publishing capacity is consumed',async()=>{const p=project(),s=shop();p.shops=[{...s,checkedAt:0,catalogDone:false}];p.callDay=new Date().toISOString().slice(0,10);p.callsToday=1000;const e=engine(()=>{throw Error('Must not call provider');});await assert.rejects(()=>e.advance('member',p),/daily research allowance/);assert.equal(e.calls.length,0);});
test('one viral shop cannot become a cross-shop opportunity through two token reviews',()=>{const big=shop(1),small=shop(2),third=shop(3);small.reviews=small.reviews.slice(0,1);third.reviews=third.reviews.slice(0,1);assert.equal(analyzeNiche([big,small,third],now).opportunities.length,0);});
test('digital files and mixed garment offers stay out of single-product comparisons',()=>{assert.equal(model.researchProduct('Romance shirt PNG','download','tee'),'digital');assert.equal(model.researchProduct('Romance T-Shirts + Sweatshirts','physical','crewneck'),'mixedApparel');assert.equal(model.researchProduct('Romance Tee','physical','tee'),'tee');});
test('unfinished reviews are represented as pending in listing responses and UI',()=>{const view=readFileSync(new URL('../app/niche-research-view.ts',import.meta.url),'utf8'),ui=readFileSync(new URL('../app/market-watch/research/research-client.tsx',import.meta.url),'utf8');assert.match(view,/reviewsComplete:s.reviewsDone/);assert.match(ui,/Reviews being checked/);});
test('automatic discovery preserves a member-edited panel, including an intentionally empty selection',async()=>{for(const selected of [[2],[]]){const p=project();p.shops=[shop(1),shop(2)];for(const s of p.shops)for(const r of s.reviews)r.at=Math.floor(Date.now()/1000)-day;p.candidates=p.shops.map(s=>({id:s.id,hits:1}));p.selectionEdited=true;p.selected=selected;p.searchDone=[true];const e=engine(()=>{throw Error('No network expected');});await e.advance('member',p);assert.deepEqual(p.selected,selected);}});

test('niche-filtered catalogs cannot establish an unmet product-format opportunity',()=>{const shops=[shop(1),shop(2),shop(3)];shops[0].listings.push(listing(999,1,{product:'tote',tags:['unrelated theme']}));const a=analyzeNiche(shops,now);assert(a.opportunities.length);assert(a.opportunities.every(o=>!o.hypothesis.includes('these shops offer')&&!o.hypothesis.includes('tote test')));});

test('buyer evidence does not mislabel praise as a complaint or repeat identical excerpts',()=>{
 const s=shop();s.reviews=[
 {transactionId:1,listingId:100,at:now,rating:5,text:'No peeling after washing. Great for my book club.'},
 {transactionId:2,listingId:100,at:now-1,rating:5,text:'No peeling after washing. Great for my book club.'},
 {transactionId:3,listingId:101,at:now-2,rating:5,text:'Has not faded at all. My book club loves it.'}];
 const themes=analyzeNiche([s],now).buyerThemes;
 assert.equal(themes.some(t=>t.name==='Print concerns'),false);
 assert.equal(themes.find(t=>t.name==='Print durability').count,3);
 assert.equal(themes.find(t=>t.name==='Book clubs').examples.length,2);
});


test('automatic panels rank recent niche evidence above overall shop size and exclude unfinished shops',()=>{
 const at=Math.floor(Date.now()/1000),small=shop(1),large=shop(2),pending=shop(3);
 for(const s of [small,large,pending])for(const r of s.reviews)r.at=at-day;
 large.catalogTotal=10000;small.reviews.push(...small.reviews.map(r=>({...r,transactionId:r.transactionId+10000})));pending.catalogDone=false;
 assert.deepEqual(model.rankNicheShops([large,pending,small],at).map(s=>s.id),[1,2]);
});

test('the reported anti-Trump shirt query matches hyphenated and unhyphenated product wording',()=>{
 const phrases=suggestedCluster('anti-Trump shirt');
 assert(matchesNiche({title:'Subtle Anti Trump Tee',tags:[]},phrases));
 assert(matchesNiche({title:'Anti-Trump Sweatshirt',tags:[]},phrases));
 assert.equal(matchesNiche({title:'Trump Shirt',tags:['pro trump']},phrases),false);
});


test('onboarding checks another candidate before starting a huge general catalog',async()=>{
 const p=project();p.shops=Array.from({length:20},(_,i)=>({...shop(i+1),reviews:[],checkedAt:now,cycleAt:now}));
 Object.assign(p.shops[19],{checkedAt:0,catalogDone:false,reviewsDone:false,catalogOffset:0,catalogTotal:9000});
 p.candidates=Array.from({length:21},(_,i)=>({id:i+1,hits:1}));
 const e=engine(url=>{assert(url.endsWith('shops/21'));return {shop_name:'Focused candidate',listing_active_count:100};});
 await e.advance('member',p);assert.equal(p.shops.length,21);assert.equal(p.shops[19].catalogOffset,0);
});
