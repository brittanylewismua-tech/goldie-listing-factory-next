import {NextResponse} from 'next/server';
import {withErrorLog} from '@/app/error-log';
import {requireFeatureApi} from '@/app/require-feature';
import {watchesFor} from '@/app/niche-watch-store';
import {crossSiteWrite,CROSS_SITE_REFUSAL} from '@/app/same-site-only';
import {etsyApiCredential,recordEtsyCall,waitForEtsyCapacity} from '@/app/api/etsy/client';
import {listingDisplay,listingPhoto,listingPrice,type EtsyDisplayListing} from '@/app/etsy-listing-display';
import {decodeEntities} from '@/app/shop-map-worlds';
import {scanParams,pagesToScan,rankScan,coverage,SCAN_PAGE,SCAN_CAP,ORDERS,type KeywordOrder} from '@/app/keyword-scan';

/** One page of Etsy search. Throws with a sentence a member can act on. */
async function searchPage(phrase:string,offset:number,query:string){
  await waitForEtsyCapacity();
  const response=await fetch(`https://openapi.etsy.com/v3/application/listings/active?${scanParams(phrase,offset,query)}`,{
    headers:{'x-api-key':etsyApiCredential()},signal:AbortSignal.timeout(25000)});
  await recordEtsyCall(response,'search');
  if(!response.ok)throw new Error('Etsy search could not load. Please try again.');
  const body=await response.json() as {count?:number;results?:EtsyDisplayListing[]};
  if(!Array.isArray(body.results))throw new Error('Etsy returned an incomplete search response. Please try again.');
  return {rows:body.results,total:typeof body.count==='number'&&Number.isFinite(body.count)?body.count:null};
}

export const GET=withErrorLog('keyword-search',async(request:Request)=>{
  if(crossSiteWrite(request))return NextResponse.json(CROSS_SITE_REFUSAL,{status:403});
  const access=await requireFeatureApi('marketWatch');
  if(!access.ok)return access.response;
  const params=new URL(request.url).searchParams;
  const key=params.get('key')??'';
  const order=(params.get('sort')??'favorites') as KeywordOrder;
  if(!ORDERS.includes(order))
    return NextResponse.json({error:'Choose a valid sort order.'},{status:400});
  const watch=(await watchesFor(access.user.userId)).find((row:{key:string;phrase:string})=>row.key===key);
  if(!watch)return NextResponse.json({error:'That keyword is not on your watchlist.'},{status:404});
  const query=(params.get('query')??'').trim().slice(0,80);
  try{
    /*
      THE FIRST PAGE DECIDES HOW MUCH OF THE KEYWORD THERE IS TO SCAN.

      Etsy reports the true total on every response, so one call settles
      whether this phrase can be covered completely (three pages for a
      209-listing phrase) or only sampled (the cap, for a six-figure one).
      Pages run one at a time because the pacer serialises Etsy calls anyway.
    */
    const first=await searchPage(watch.phrase,0,query);
    const rows=[...first.rows];
    const pages=pagesToScan(first.total);
    for(let page=1;page<pages;page++){
      const next=await searchPage(watch.phrase,page*SCAN_PAGE,query);
      if(!next.rows.length)break;
      rows.push(...next.rows);
      if(rows.length>=SCAN_CAP)break;
    }
    const now=Math.floor(Date.now()/1000);
    const seen=new Map<number,EtsyDisplayListing>();
    for(const row of rows){const id=Number(row.listing_id);if(id&&!seen.has(id))seen.set(id,row);}
    const scanned=[...seen.values()].map(row=>({
      listingId:Number(row.listing_id),title:decodeEntities(String(row.title??'')),
      etsyUrl:`https://www.etsy.com/listing/${row.listing_id}`,
      priceCents:listingPrice(row),currency:row.price?.currency_code??'USD',
      favorites:row.num_favorers??null,views:row.views??null,
      createdAt:row.original_creation_timestamp??null,
      listedAt:row.creation_timestamp??row.created_timestamp??null,
      ageDays:row.original_creation_timestamp?Math.max(0,Math.floor((now-row.original_creation_timestamp)/86400)):null,
      imageUrl:listingPhoto(row),reviewsOnThisListing:null,displayFresh:true,intervals:0,
    }));
    const ranked=rankScan(scanned,order);
    /*
      PHOTOS FOR THE PAGE BEING LOOKED AT, NOT FOR THE SCAN.

      Search responses carry every ranking field but no images, and the batch
      endpoint takes 100 ids at a time. Hydrating the whole scan would double
      its cost to show pictures nobody has scrolled to yet, so only the top of
      the ranking is hydrated. The rest arrive with their measurements intact
      and their photo filled in when they reach the top of a different sort.
    */
    const photos=await listingDisplay(ranked.slice(0,SCAN_PAGE).map(row=>row.listingId),'search').catch(()=>null);
    const listings=photos?ranked.map(row=>{
      const detail=photos.get(row.listingId);
      return detail?{...row,imageUrl:listingPhoto(detail)||row.imageUrl,title:detail.title??row.title}:row;
    }):ranked;
    return NextResponse.json({
      listings,scanned:listings.length,total:first.total,
      complete:first.total!==null&&listings.length>=first.total,
      coverage:coverage(listings.length,first.total),
      photosUnavailable:!photos,asOf:now,
    },{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Etsy search could not load. Please try again.'},{status:502});}
});
