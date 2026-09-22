import {NextResponse} from 'next/server';
import {withErrorLog} from '@/app/error-log';
import {requireFeatureApi} from '@/app/require-feature';
import {watchesFor} from '@/app/niche-watch-store';
import {crossSiteWrite,CROSS_SITE_REFUSAL} from '@/app/same-site-only';
import {etsyApiCredential,recordEtsyCall,waitForEtsyCapacity} from '@/app/api/etsy/client';
import {listingDisplay,listingPhoto,listingPrice,type EtsyDisplayListing} from '@/app/etsy-listing-display';
import {decodeEntities} from '@/app/shop-map-worlds';
import {keywordSearchParams,keywordNextOffset,orderedSearchDetails,type KeywordOrder} from '@/app/keyword-search';

export const GET=withErrorLog('keyword-search',async(request:Request)=>{
  if(crossSiteWrite(request))return NextResponse.json(CROSS_SITE_REFUSAL,{status:403});
  const access=await requireFeatureApi('marketWatch');
  if(!access.ok)return access.response;
  const params=new URL(request.url).searchParams;
  const key=params.get('key')??'';
  const offset=Number(params.get('offset')??0);
  const order=params.get('sort')??'newest';
  if(!Number.isSafeInteger(offset)||offset<0||!['newest','relevance','price','price-desc'].includes(order))
    return NextResponse.json({error:'Choose a valid search page and sort order.'},{status:400});
  const watch=(await watchesFor(access.user.userId)).find(row=>row.key===key);
  if(!watch)return NextResponse.json({error:'That keyword is not on your watchlist.'},{status:404});
  const query=(params.get('query')??'').trim().slice(0,80);
  try{
    await waitForEtsyCapacity();
    const search=keywordSearchParams(watch.phrase,order as KeywordOrder,offset,query);
    const response=await fetch(`https://openapi.etsy.com/v3/application/listings/active?${search}`,{
      headers:{'x-api-key':etsyApiCredential()},signal:AbortSignal.timeout(25000)});
    await recordEtsyCall(response,'search');
    if(!response.ok)throw new Error(offset?'Etsy could not return this search page. Try again or narrow your search.':'Etsy search could not load. Please try again.');
    const body=await response.json() as {count?:number;results?:EtsyDisplayListing[]};
    if(!Array.isArray(body.results))throw new Error('Etsy returned an incomplete search response. Please try again.');
    const details=await listingDisplay(body.results.map(row=>Number(row.listing_id)),'search');
    const now=Math.floor(Date.now()/1000);
    const listings=orderedSearchDetails(body.results,details).map(row=>({
      listingId:Number(row.listing_id),title:decodeEntities(String(row.title??'')),imageUrl:listingPhoto(row),
      etsyUrl:`https://www.etsy.com/listing/${row.listing_id}`,priceCents:listingPrice(row),currency:row.price?.currency_code??'USD',
      favorites:row.num_favorers??null,views:row.views??null,
      createdAt:row.original_creation_timestamp??null,
      listedAt:row.creation_timestamp??row.created_timestamp??null,
      ageDays:row.original_creation_timestamp?Math.max(0,Math.floor((now-row.original_creation_timestamp)/86400)):null,
      reviewsOnThisListing:null,displayFresh:true,intervals:0,
    }));
    const total=typeof body.count==='number'&&Number.isFinite(body.count)?body.count:null;
    return NextResponse.json({listings,total,nextOffset:keywordNextOffset(offset,body.results.length,total),asOf:now},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Etsy search could not load. Please try again.'},{status:502});}
});
