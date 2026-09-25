import {etsyApiCredential,recordEtsyCall,waitForEtsyCapacity,etsyBudget} from '@/app/api/etsy/client';
import {listingPhoto,listingPrice,listingDisplay,type EtsyDisplayListing} from '@/app/etsy-listing-display';
import {productFamily} from '@/app/product-type-utils';
import {decodeEntities} from '@/app/shop-map-worlds';
import {shopWatchRoom} from '@/app/shop-watch';
import {putEvidence,cachedResearchPage,cacheResearchPage} from '@/app/niche-research-store';
import {matchesNiche,researchProduct,qualifies,nicheMetrics,snapshot,type NicheProject,type NicheShop,type NicheListing,type NicheReview} from '@/app/niche-research-model';
type EtsyBody={readAt?:number;count?:number;results?:Array<Record<string,unknown>>;shop_name?:string;url?:string;listing_active_count?:number};
async function etsy(p:NicheProject,path:string):Promise<EtsyBody>{
 const cached=await cachedResearchPage(path);if(cached)return cached as EtsyBody;
 const day=new Date().toISOString().slice(0,10);if(p.callDay!==day){p.callDay=day;p.callsToday=0;}
 if(p.callsToday>=1000){p.nextRun=Math.floor(Date.now()/1000)+86400;throw Error('This niche reached its daily research allowance. Collection will resume automatically tomorrow.');}
 const [budget,room]=await Promise.all([etsyBudget(),shopWatchRoom()]);if(budget.remaining<500||room<=500)throw Error('Research is waiting for Etsy capacity. Existing publishing and shop monitoring retain their reserved capacity.');
 await waitForEtsyCapacity();p.callsToday++;const r=await fetch(`https://openapi.etsy.com/v3/application/${path}`,{headers:{'x-api-key':etsyApiCredential()},signal:AbortSignal.timeout(25000)});await recordEtsyCall(r,'shop-watch');if(!r.ok)throw Error(r.status===429?'Etsy is limiting requests. Progress is saved and collection will retry automatically.':`Etsy could not complete this check (${r.status}). Progress is saved for the next attempt.`);const raw=await r.json() as EtsyBody;
 const keep=['listing_id','shop_id','title','tags','price','original_creation_timestamp','state','type','transaction_id','create_timestamp','created_timestamp','rating','review'];
 const body:EtsyBody={...raw,readAt:Math.floor(Date.now()/1000),results:raw.results?.map(row=>Object.fromEntries(keep.filter(k=>k in row).map(k=>[k,row[k]])))};
 await cacheResearchPage(path,body);return body;
}
function rows(b:EtsyBody){if(!Array.isArray(b.results))throw Error('Etsy returned an incomplete response. Your last completed page is saved.');return b.results;}
export function resetShop(s:NicheShop,now:number){s.catalogOffset=0;s.catalogDone=false;s.reviewOffset=0;s.reviewsDone=false;s.reviewSince=s.checkedAt?Math.max(now-365*86400,s.checkedAt-7*86400):now-365*86400;s.cycleAt=now;delete s.error;}
async function checkShop(user:string,p:NicheProject,s:NicheShop){
 if(!s.catalogDone){const b=await etsy(p,`shops/${s.id}/listings/active?limit=100&offset=${s.catalogOffset}`),page=rows(b),changed:NicheListing[]=[];
 for(const raw of page){const r=raw as EtsyDisplayListing,id=Number(r.listing_id),title=decodeEntities(String(r.title??'')),tags=(r.tags??[]).map(String);if(!Number.isSafeInteger(id)||id<=0)continue;if(!matchesNiche({title,tags},p.phrases))continue;const old=s.listings.find(l=>l.id===id);const l:NicheListing={id,shopId:s.id,title,tags,image:listingPhoto(r)||old?.image||'',imageAt:listingPhoto(r)?Math.floor(Date.now()/1000):old?.imageAt??0,displayAt:b.readAt??Math.floor(Date.now()/1000),price:listingPrice(r),currency:r.price?.currency_code??'',product:researchProduct(title,raw.type,productFamily(title)),createdAt:r.original_creation_timestamp??null,seenAt:s.cycleAt,active:true};if(old)Object.assign(old,l);else s.listings.push(l);changed.push(l);}
 s.catalogOffset+=page.length;s.catalogTotal=typeof b.count==='number'?b.count:null;s.catalogDone=page.length<100||s.catalogTotal!==null&&s.catalogOffset>=s.catalogTotal;
 if(s.catalogDone&&!s.listings.length)s.reviewsDone=true;
 if(s.catalogDone)for(const l of s.listings)if(l.active&&l.seenAt!==s.cycleAt){l.active=false;changed.push(l);}
 await putEvidence(user,p.id,s.id,'listing',changed);return;
 }
 if(!s.reviewsDone){const b=await etsy(p,`shops/${s.id}/reviews?limit=100&offset=${s.reviewOffset}&min_created=${s.reviewSince}&max_created=${s.cycleAt}`),page=rows(b),changed:NicheReview[]=[];
 // Catalog enumeration finishes first. Keep only reviews joined to known niche listings.
 for(const row of page){const transactionId=Number(row.transaction_id),listingId=Number(row.listing_id),at=Number(row.create_timestamp??row.created_timestamp);if(!Number.isSafeInteger(transactionId)||transactionId<=0||!Number.isSafeInteger(listingId)||!Number.isFinite(at)||!s.listings.some(l=>l.id===listingId))continue;const r:NicheReview={transactionId,listingId,at,rating:typeof row.rating==='number'?row.rating:null,text:decodeEntities(String(row.review??'')).slice(0,700)};const old=s.reviews.find(r=>r.transactionId===transactionId);if(old)Object.assign(old,r);else s.reviews.push(r);changed.push(r);}
 await putEvidence(user,p.id,s.id,'review',changed);s.reviewOffset+=page.length;s.reviewsDone=page.length<100||typeof b.count==='number'&&s.reviewOffset>=b.count;return;
 }
 const sample=[...s.listings].sort((a,b)=>s.reviews.filter(r=>r.listingId===b.id).length-s.reviews.filter(r=>r.listingId===a.id).length).slice(0,12);
 if(sample.length){const details=await listingDisplay(sample.map(l=>l.id),'shop-watch');for(const l of sample){const r=details.get(l.id);if(r){l.image=listingPhoto(r);l.imageAt=Math.floor(Date.now()/1000);}}await putEvidence(user,p.id,s.id,'listing',sample);}
 s.checkedAt=s.cycleAt;
}
function finish(p:NicheProject,now:number){p.phase='ready';p.nextRun=now+6*3600;const selected=p.shops.filter(s=>p.selected.includes(s.id));if(selected.length&&selected.every(s=>s.catalogDone&&s.reviewsDone))p.history=[...p.history,snapshot(selected,now)].slice(-365);}
export async function advanceResearch(user:string,p:NicheProject){
 delete p.error;const now=Math.floor(Date.now()/1000);p.nextRun=now;
 if(p.phase==='ready'){
 if(!p.monitoring){p.nextRun=0;return;}
 p.phase='refreshing';p.cycleAt=now;for(const s of p.shops.filter(s=>p.selected.includes(s.id)))resetShop(s,now);return;
 }
 if(p.phase==='refreshing'){
 const s=p.shops.find(s=>p.selected.includes(s.id)&&s.checkedAt<s.cycleAt);if(s){await checkShop(user,p,s);return;}
 // A new discovery pass every week adds candidates without replacing the member's panel.
 if(now-p.lastDiscovery>=7*86400){p.searchIndex=0;p.searchOffsets=p.phrases.map(()=>0);p.searchDone=p.phrases.map(()=>false);p.targetShops=p.shops.filter(s=>qualifies(s,now)).length+2;p.phase='discovering';p.lastDiscovery=now;return;}
 finish(p,now);return;
 }
 if(p.phase==='discovering'){
 let index=p.searchIndex%p.phrases.length;for(let i=0;i<p.phrases.length&&p.searchDone[index];i++)index=(index+1)%p.phrases.length;
 if(p.searchDone.every(Boolean)){finish(p,now);return;}
 const offset=p.searchOffsets[index]??0,b=await etsy(p,`listings/active?${new URLSearchParams({keywords:p.phrases[index],limit:'100',offset:String(offset),sort_on:index%2===0?'score':'created',sort_order:'desc'})}`),page=rows(b);
 for(const row of page){const id=Number(row.shop_id);if(!Number.isSafeInteger(id)||id<=0)continue;const old=p.candidates.find(c=>c.id===id);if(old)old.hits++;else p.candidates.push({id,hits:1});}
 p.searchOffsets[index]=offset+page.length;p.searchDone[index]=page.length<100||typeof b.count==='number'&&p.searchOffsets[index]>=b.count;
 p.searchIndex=index+1;p.candidates.sort((a,b)=>b.hits-a.hits||a.id-b.id);p.phase=p.searchOffsets.some(n=>n===0)?'discovering':'checking';return;
 }
 const qualified=p.shops.filter(s=>qualifies(s,now));
 if(!p.history.length&&!p.selectionEdited)p.selected=qualified.slice(0,10).map(s=>s.id);
 if(qualified.length>=p.targetShops){if(!p.selected.length&&!p.selectionEdited){
 // Mix shop sizes without inventing a quality score or treating small as new.
 const ranked=[...qualified].sort((a,b)=>(a.catalogTotal??Infinity)-(b.catalogTotal??Infinity));p.selected=ranked.slice(0,5).concat(ranked.slice(5).sort((a,b)=>nicheMetrics(b,now).reviews90-nicheMetrics(a,now).reviews90).slice(0,5)).map(s=>s.id);}
 finish(p,now);return;}
 const candidate=p.candidates.find(c=>!p.shops.some(s=>s.id===c.id));
 const checked=p.shops.filter(s=>s.checkedAt>=s.cycleAt).length;
 // Inspect shop sizes in small batches before committing to full catalogs.
 // Otherwise the search's largest general-purpose seller can monopolize onboarding.
 const profiling=p.shops.length<Math.min(p.candidates.length,(Math.floor(checked/20)+1)*20);
 const pending=p.shops.filter(s=>s.checkedAt<s.cycleAt).sort((a,b)=>(a.catalogTotal??Infinity)-(b.catalogTotal??Infinity))[0];
 if(pending&&(!profiling||!candidate)){await checkShop(user,p,pending);return;}
 if(!candidate){if(p.searchDone.every(Boolean)){if(!p.selected.length&&!p.selectionEdited)p.selected=qualified.map(s=>s.id);finish(p,now);}else p.phase='discovering';return;}
 const b=await etsy(p,`shops/${candidate.id}`);p.shops.push({id:candidate.id,name:b.shop_name??`Shop ${candidate.id}`,url:b.url??`https://www.etsy.com/shop/${encodeURIComponent(b.shop_name??'')}`,catalogOffset:0,catalogTotal:typeof b.listing_active_count==='number'?b.listing_active_count:null,catalogDone:false,reviewOffset:0,reviewsDone:false,listings:[],reviews:[],checkedAt:0,cycleAt:now,reviewSince:now-365*86400});
}
