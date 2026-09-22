import {NextResponse} from 'next/server';
import {env} from 'cloudflare:workers';
import {requireFeatureApi} from '@/app/require-feature';
import {crossSiteWrite,CROSS_SITE_REFUSAL} from '@/app/same-site-only';
import {watchesFor} from '@/app/niche-watch-store';
import {listingDisplay,listingPhoto,listingPrice,type EtsyDisplayListing} from '@/app/etsy-listing-display';
import {ensureMarketCollections,SAVE_COMPETITOR_SQL,type SavedCompetitor} from '@/app/market-collection';
import {withErrorLog} from '@/app/error-log';
function snapshot(row:EtsyDisplayListing,now:number):SavedCompetitor{return {
 listingId:Number(row.listing_id),title:String(row.title??''),imageUrl:listingPhoto(row),etsyUrl:`https://www.etsy.com/listing/${row.listing_id}`,
 priceCents:listingPrice(row),currency:row.price?.currency_code??'USD',favorites:row.num_favorers??null,views:row.views??null,
 createdAt:row.original_creation_timestamp??null,listedAt:row.creation_timestamp??row.created_timestamp??null,
 ageDays:row.original_creation_timestamp?Math.max(0,Math.floor((now-row.original_creation_timestamp)/86400)):null,
 reviewsOnThisListing:null,displayFresh:true,intervals:0};}
async function context(request:Request){
 if(crossSiteWrite(request))return {error:NextResponse.json(CROSS_SITE_REFUSAL,{status:403})};
 const access=await requireFeatureApi('marketWatch');if(!access.ok)return {error:access.response};
 const key=new URL(request.url).searchParams.get('key')??'';
 if(!(await watchesFor(access.user.userId)).some(w=>w.key===key))return {error:NextResponse.json({error:'Choose one of your tracked keywords.'},{status:404})};
 const db=(env as unknown as {DB:D1Database}).DB;await ensureMarketCollections(db);
 return {db,userId:access.user.userId,key};
}
type Row={listing_id:number;payload:string;baseline:string;saved_at:number;checked_at:number;unavailable:number};
async function rows(db:D1Database,user:string,key:string){return (await db.prepare('SELECT listing_id,payload,baseline,saved_at,checked_at,unavailable FROM market_keyword_collections WHERE user_id=? AND keyword_key=? AND archived=0 ORDER BY saved_at DESC,listing_id DESC').bind(user,key).all<Row>()).results??[];}
function response(saved:Row[]){return NextResponse.json({entries:saved.map(r=>({listing:JSON.parse(r.payload),baseline:JSON.parse(r.baseline),savedAt:r.saved_at,checkedAt:r.checked_at,unavailable:Boolean(r.unavailable)}))},{headers:{'Cache-Control':'private, no-store'}});}
export const GET=withErrorLog('keyword-collection',async(request:Request)=>{
 const c=await context(request);if(c.error)return c.error;return response(await rows(c.db!,c.userId!,c.key!));
});
export const POST=withErrorLog('keyword-collection',async(request:Request)=>{
 const c=await context(request);if(c.error)return c.error;
 const {db,userId,key}=c as {db:D1Database;userId:string;key:string};
 const body=await request.json().catch(()=>null) as {action?:string;listingId?:unknown}|null;const id=Number(body?.listingId);
 if(!['save','remove','refresh'].includes(body?.action??'')||body?.action!=='refresh'&&(!Number.isSafeInteger(id)||id<=0))return NextResponse.json({error:'Choose a listing and a valid action.'},{status:400});
 try{
 const now=Math.floor(Date.now()/1000);
 if(body?.action==='remove'){
 await db.prepare('UPDATE market_keyword_collections SET archived=1 WHERE user_id=? AND keyword_key=? AND listing_id=?').bind(userId,key,id).run();
 }else if(body?.action==='save'){
 const existing=await db.prepare('SELECT archived FROM market_keyword_collections WHERE user_id=? AND keyword_key=? AND listing_id=?').bind(userId,key,id).first<{archived:number}>();
 if(!existing||existing.archived){
 const row=(await listingDisplay([id],'search')).get(id);if(!row)return NextResponse.json({error:'Etsy could not return that listing. It has not been added.'},{status:502});
 const payload=JSON.stringify(snapshot(row,now));
 await db.prepare(SAVE_COMPETITOR_SQL).bind(userId,key,id,payload,payload,now,now,userId,key).run();
 const saved=await db.prepare('SELECT listing_id FROM market_keyword_collections WHERE user_id=? AND keyword_key=? AND listing_id=? AND archived=0').bind(userId,key,id).first();
 if(!saved)return NextResponse.json({error:'This collection holds 100 listings. Remove one before adding another.'},{status:409});
 }
 }else{
 const saved=await rows(db,userId,key);
 const details=await listingDisplay(saved.map(r=>r.listing_id),'search');
 if(saved.length)await db.batch(saved.map(r=>{
 const row=details.get(r.listing_id);
 // A missing API record is unavailable, not evidence that it sold or was removed.
 return row?db.prepare('UPDATE market_keyword_collections SET payload=?,checked_at=?,unavailable=0 WHERE user_id=? AND keyword_key=? AND listing_id=? AND checked_at<=?').bind(JSON.stringify(snapshot(row,now)),now,userId,key,r.listing_id,now):db.prepare('UPDATE market_keyword_collections SET unavailable=1 WHERE user_id=? AND keyword_key=? AND listing_id=? AND checked_at<=?').bind(userId,key,r.listing_id,now);
 }));
 }
 return response(await rows(db,userId,key));
 }catch{return NextResponse.json({error:'The collection update could not be confirmed. Reload the collection before trying again.'},{status:502});}
});
