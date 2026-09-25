/** Review dates measure review activity, never exact sale dates or search attribution. */
export type NicheListing={id:number;shopId:number;title:string;tags:string[];image:string;displayAt:number;imageAt?:number;price:number|null;currency:string;product:string;createdAt:number|null;seenAt:number;active:boolean};
export type NicheReview={transactionId:number;listingId:number;at:number;rating:number|null;text:string};
export type NicheShop={id:number;name:string;url:string;catalogOffset:number;catalogTotal:number|null;catalogDone:boolean;reviewOffset:number;reviewsDone:boolean;listings:NicheListing[];reviews:NicheReview[];checkedAt:number;cycleAt:number;reviewSince:number;error?:string;};
export type NicheSnapshot={at:number;shopIds:number[];listings:number;reviews30:number;phrases:Record<string,{listings:number;reviews:number;shops:number}>;products:Record<string,number>};
export type NicheProject={id:string;name:string;phrases:string[];createdAt:number;updatedAt:number;searchIndex:number;searchOffsets:number[];searchDone:boolean[];candidates:Array<{id:number;hits:number}>;shops:NicheShop[];selected:number[];selectionEdited?:boolean;phase:'discovering'|'checking'|'ready'|'refreshing';error?:string;monitoring:boolean;nextRun:number;cycleAt:number;history:NicheSnapshot[];lastDiscovery:number;callsToday:number;callDay:string;targetShops:number};
const aliases:Record<string,string>={shirts:'shirt',tees:'shirt',tee:'shirt',tshirt:'shirt',tshirts:'shirt',sweatshirts:'sweatshirt',crewneck:'sweatshirt',crewnecks:'sweatshirt',hoodies:'hoodie',readers:'reader',reading:'reader',books:'book',novels:'book',novel:'book',lovers:'lover',gifts:'gift',mugs:'mug',teachers:'teacher',dogs:'dog',cats:'cat',moms:'mom',mothers:'mom',mother:'mom',bookish:'book',bookworm:'book',bookworms:'book',romances:'romance'};
export function nicheWords(value:string){return value.toLowerCase().replace(/t[ -]?shirts?/g,'shirt').replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean).map(w=>aliases[w]??w);}
export function matchesNiche(listing:{title:string;tags:string[]},phrases:string[]){const words=new Set(nicheWords([listing.title,...listing.tags].join(' ')));return phrases.some(phrase=>{const required=nicheWords(phrase);return required.length>0&&required.every(w=>words.has(w));});}
export function suggestedCluster(value:string){
 const phrase=value.trim().replace(/\s+/g,' ').slice(0,100);const variants=[phrase];
 if(/\breader\b/i.test(phrase))variants.push(phrase.replace(/\breader\b/i,'book'),phrase.replace(/\breader\b/i,'novel'));
 if(/\bbook(?:ish)?\b/i.test(phrase))variants.push(phrase.replace(/\bbook(?:ish)?\b/i,'reader'));
 if(/\b(shirt|tee)\b/i.test(phrase))variants.push(phrase.replace(/\b(shirt|tee)\b/i,'sweatshirt'),phrase.replace(/\b(shirt|tee)\b/i,'hoodie'));
 if(/\b(sweatshirt|hoodie)\b/i.test(phrase))variants.push(phrase.replace(/\b(sweatshirt|hoodie)\b/i,'shirt'));
 return [...new Set(variants.filter(Boolean))].slice(0,8);
}
/** A digital file or mixed-garment offer is not evidence for one physical blank. */
export function researchProduct(title:string,type:unknown,fallback:string){
 if(type==='download')return 'digital';
 const shirt=/\b(?:t[ -]?shirts?|tees?)\b/i.test(title);
 const warm=/\b(?:sweatshirts?|sweaters?|crewnecks?|hoodies?)\b/i.test(title);
 return shirt&&warm?'mixedApparel':fallback||'other';
}
export function nicheMetrics(shop:NicheShop,at:number){
 const ids=new Set(shop.listings.map(l=>l.id));const reviews=[...new Map(shop.reviews.filter(r=>ids.has(r.listingId)&&r.at<=at&&r.at>=at-365*86400).map(r=>[r.transactionId,r])).values()];
 const recent=reviews.filter(r=>r.at>=at-90*86400),prior=reviews.filter(r=>r.at>=at-180*86400&&r.at<at-90*86400);
 const active=shop.listings.filter(l=>l.active),reviewed=new Set(reviews.map(r=>r.listingId));
 const complete=shop.catalogDone&&shop.reviewsDone;
 return {matching:active.length,reviewedListings:reviewed.size,reviews365:reviews.length,reviews90:recent.length,reviews30:reviews.filter(r=>r.at>=at-30*86400).length,reviewsPrior90:complete?prior.length:null,
 concentration:shop.catalogDone&&shop.catalogTotal?active.length/shop.catalogTotal:null,latestReview:reviews.length?Math.max(...reviews.map(r=>r.at)):null,
 qualified:complete&&active.length>=20&&reviews.length>=10&&reviewed.size>=3&&recent.length>0,
 focused:complete&&!!shop.catalogTotal&&active.length/shop.catalogTotal>=.4&&reviews.length>=5&&recent.length>0,
 emerging:complete&&active.length<20&&recent.length>0};
}
export function qualifies(s:NicheShop,at:number){const m=nicheMetrics(s,at);return m.qualified||m.focused;}
const buyerPatterns=[
 {name:'Book clubs',re:/\bbook club\b/i},{name:'Birthdays',re:/\bbirthday\b/i},{name:'Friends and shared interests',re:/\b(?:friend|bestie|best friend)\b/i},{name:'Family recipients',re:/\b(?:daughter|sister|mom|mother|wife|husband|son|dad|father)\b/i},{name:'Groups and matching items',re:/\b(?:matching|our group|everyone in|girls trip|bachelorette)\b/i},{name:'Comfort and softness',re:/\b(?:soft|comfortable|comfy)\b/i},{name:'Fit concerns',re:/\b(?:too small|too big|runs small|runs large|sizing was off|size was wrong)\b/i},{name:'Print concerns',re:/\b(?:faded|peeling|blurry|print.*(?:bad|poor|crooked))\b/i},{name:'Buyer requests and suggestions',re:/\b(?:wish|would love|please make|more colors|more colours)\b/i},
];
export function analyzeNiche(shops:NicheShop[],at:number){
 const listings=[...new Map(shops.flatMap(s=>s.listings).map(l=>[l.id,l])).values()],byId=new Map(listings.map(l=>[l.id,l]));
 const reviews=[...new Map(shops.flatMap(s=>s.reviews).filter(r=>byId.has(r.listingId)&&r.at<=at&&r.at>=at-365*86400).map(r=>[r.transactionId,r])).values()];
 const recent=reviews.filter(r=>r.at>=at-30*86400),prior=reviews.filter(r=>r.at>=at-60*86400&&r.at<at-30*86400);
 const tags=new Map<string,{listings:NicheListing[];reviews:number;prior:number;shops:Set<number>}>();
 for(const l of listings)for(const tag of new Set(l.tags.map(t=>t.toLowerCase().trim()).filter(t=>t.length>=4))){const p=tags.get(tag)??{listings:[],reviews:0,prior:0,shops:new Set<number>()};p.listings.push(l);tags.set(tag,p);}
 for(const r of [...recent,...prior]){const l=byId.get(r.listingId)!;for(const tag of new Set(l.tags.map(t=>t.toLowerCase().trim()))){const p=tags.get(tag);if(!p)continue;if(r.at>=at-30*86400){p.reviews++;p.shops.add(l.shopId);}else p.prior++;}}
 const phrases=[...tags].map(([phrase,p])=>({phrase,listings:p.listings.filter(l=>l.active).length,reviews:p.reviews,prior:p.prior,shops:p.shops.size,listingIds:p.listings.map(l=>l.id),products:[...new Set(p.listings.map(l=>l.product))]})).sort((a,b)=>b.shops-a.shops||b.reviews-a.reviews);
 const products=[...new Set(listings.map(l=>l.product))].map(product=>{const ls=listings.filter(l=>l.product===product),ids=new Set(ls.map(l=>l.id)),rr=recent.filter(r=>ids.has(r.listingId));const prices=[...new Set(ls.filter(l=>l.active&&l.price!==null).map(l=>l.currency))].map(currency=>{const values=ls.filter(l=>l.active&&l.currency===currency&&l.price!==null).map(l=>l.price!).sort((a,b)=>a-b);return {currency,low:values[Math.floor((values.length-1)*.25)],high:values[Math.ceil((values.length-1)*.75)],count:values.length};});return {product,listings:ls.filter(l=>l.active).length,reviews:rr.length,shops:new Set(rr.map(r=>byId.get(r.listingId)!.shopId)).size,prices,listingIds:ls.map(l=>l.id)};}).sort((a,b)=>b.shops-a.shops||b.reviews-a.reviews);
 const buyerThemes=buyerPatterns.map(pattern=>{const matches=reviews.filter(r=>pattern.re.test(r.text));return {name:pattern.name,count:matches.length,shops:new Set(matches.map(r=>byId.get(r.listingId)!.shopId)).size,examples:matches.sort((a,b)=>b.at-a.at).slice(0,3)};}).filter(p=>p.count>=2).sort((a,b)=>b.shops-a.shops||b.count-a.count);
 const repeated=listings.map(l=>({...l,reviews:recent.filter(r=>r.listingId===l.id).length,prior:prior.filter(r=>r.listingId===l.id).length})).filter(l=>l.reviews>0).sort((a,b)=>b.reviews-a.reviews);
 const young=repeated.filter(l=>l.createdAt!==null&&l.createdAt>=at-90*86400);
 const smallShopIds=new Set(shops.filter(s=>s.catalogTotal!==null&&s.catalogTotal<=100).map(s=>s.id));
 const opportunities=phrases.filter(p=>{if(p.shops<3||p.reviews<5||/^(gift for her|gift for him|gift|shirt|tshirt|sweatshirt|hoodie|custom shirt|personalized gift)$/.test(p.phrase))return false;const rr=recent.filter(r=>p.listingIds.includes(r.listingId));const counts=new Map<number,number>();for(const r of rr){const shop=byId.get(r.listingId)!.shopId;counts.set(shop,(counts.get(shop)??0)+1);}return Math.max(...counts.values())/Math.max(1,rr.length)<=.7;}).slice(0,6).map(p=>{const ls=listings.filter(l=>p.listingIds.includes(l.id));
 const rr=recent.filter(r=>p.listingIds.includes(r.listingId)),leading=products.map(product=>({name:product.product,count:rr.filter(r=>byId.get(r.listingId)!.product===product.product).length})).sort((a,b)=>b.count-a.count)[0];
 const newer=ls.filter(l=>l.createdAt!==null&&l.createdAt>=at-90*86400&&rr.some(r=>r.listingId===l.id));
 const growth=p.prior>0&&p.reviews>=p.prior+3&&p.reviews>=p.prior*1.5;
 const hypothesis=newer.length>=2?`${newer.length} listings created within 90 days are already receiving reviews. Compare those newer entries with the established listings to identify which treatments buyers are responding to.`
 :growth?`Review activity increased from ${p.prior} to ${p.reviews} between the previous and latest 30-day periods. ${leading?.name??'Products'} account for the most recent reviews; inspect those examples before choosing a test.`
 :`${p.reviews} reviews in the last 30 days across ${p.shops} shops make this a theme worth exploring for ${leading?.name??'products'}. Compare the examples for recurring wording, occasions and visual treatments, then develop an original concept.`;
 return {...p,hypothesis,caution:growth?'Review dates lag purchases. A rise in review activity does not establish the same rise in sales.':'The listings have purchase evidence; the phrase itself is not proven to have brought the buyer. Compare the designs and reviews as well.'};});
 return {at,shops:shops.length,listings:listings.filter(l=>l.active).length,reviews30:recent.length,reviewsPrior30:prior.length,complete:shops.length>0&&shops.every(s=>s.catalogDone&&s.reviewsDone),phrases:phrases.slice(0,40),products,buyerThemes,repeated:repeated.slice(0,40),young:young.slice(0,12),smaller:repeated.filter(l=>smallShopIds.has(l.shopId)).slice(0,12),opportunities};
}
export function snapshot(shops:NicheShop[],at:number):NicheSnapshot {const a=analyzeNiche(shops,at);return {at,shopIds:shops.map(s=>s.id).sort((a,b)=>a-b),listings:a.listings,reviews30:a.reviews30,phrases:Object.fromEntries(a.phrases.map(p=>[p.phrase,{listings:p.listings,reviews:p.reviews,shops:p.shops}])),products:Object.fromEntries(a.products.map(p=>[p.product,p.reviews]))};}
export function compareSnapshots(history:NicheSnapshot[],current:NicheSnapshot){const prior=[...history].reverse().find(h=>h.at<=current.at-86400&&h.shopIds.join(',')===current.shopIds.join(','));if(!prior)return null;return {since:prior.at,listings:current.listings-prior.listings,reviews30:current.reviews30-prior.reviews30,phrases:Object.entries(current.phrases).map(([phrase,p])=>({phrase,listings:p.listings-(prior.phrases[phrase]?.listings??0),reviews:p.reviews-(prior.phrases[phrase]?.reviews??0),shops:p.shops})).filter(p=>prior.phrases[p.phrase]!==undefined).sort((a,b)=>b.reviews-a.reviews).slice(0,12)};}
