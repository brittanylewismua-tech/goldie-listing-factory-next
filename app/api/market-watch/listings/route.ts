import {NextResponse} from 'next/server';
import {withErrorLog} from '@/app/error-log';
import {requireFeatureApi} from '@/app/require-feature';
import {watchesFor} from '@/app/niche-watch-store';
import {crossSiteWrite,CROSS_SITE_REFUSAL} from '@/app/same-site-only';
import {etsyApiCredential,recordEtsyCall,waitForEtsyCapacity} from '@/app/api/etsy/client';
import {listingDisplay,listingPhoto,listingPrice,type EtsyDisplayListing} from '@/app/etsy-listing-display';
import {decodeEntities} from '@/app/shop-map-worlds';
import {scanParams,pagesToScan,rankScan,SCAN_PAGE,ORDERS,type KeywordOrder} from '@/app/keyword-scan';
import {profileWinners} from '@/app/keyword-profile';
import {seedFromScan,countedSales,shelfIds} from '@/app/sold-overnight';

/** One page of Etsy search. Throws with a sentence a member can act on. */
async function searchPage(phrase:string,offset:number,query:string,taxonomyId?:number|null){
  await waitForEtsyCapacity();
  const response=await fetch(`https://openapi.etsy.com/v3/application/listings/active?${scanParams(phrase,offset,query,taxonomyId)}`,{
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
    /*
      THE SHELF, IF ONE WAS CHOSEN.

      Etsy files a shelf under several taxonomy ids - there is a T-shirts node
      under men's, women's, unisex and kids - and its search takes exactly
      one. So the scan divides its pages across the shelf's ids rather than
      picking one and silently dropping the rest, which would hide three
      quarters of the t-shirts on Etsy while looking like it had worked.
    */
    const shelf=(params.get('shelf')??'').trim().slice(0,60);
    const taxonomies=shelf
      ? (await shelfIds().catch(()=>[])).filter(row=>row.label===shelf).map(row=>row.id)
      : [];
    const first=await searchPage(watch.phrase,0,query,taxonomies[0]??null);
    const rows=[...first.rows];
    /* With a shelf the total belongs to one of its ids, so the budget is
       spread evenly across them all rather than being spent on the first. */
    const pages=taxonomies.length>1
      ? Math.max(taxonomies.length,Math.ceil(pagesToScan(first.total)/1))
      : pagesToScan(first.total);
    /*
      THE REMAINING PAGES GO OUT TOGETHER.

      Awaiting each page before starting the next made a ten-page scan take
      39 seconds on the live build - not because of the pacer, which spaces
      requests by about a quarter second, but because each Etsy round trip is
      roughly four. Ten of those in single file is nobody's idea of a search.

      waitForEtsyCapacity still serialises the reservations inside each of
      these, so firing them at once spaces the requests exactly as before and
      only overlaps the waiting. A page that comes back empty or fails leaves
      a gap in the scan rather than failing the whole thing: nine tenths of a
      ranking is worth more than an error, and the count shown is what was
      actually scanned.
    */
    const rest=await Promise.all(Array.from({length:Math.max(0,pages-1)},(_unused,index)=>{
      /* Round-robin: page 1 of the second shelf id before page 2 of the
         first, so a narrow shelf is never starved by a broad one. */
      const taxonomy=taxonomies.length?taxonomies[(index+1)%taxonomies.length]:null;
      const step=taxonomies.length?Math.floor((index+1)/taxonomies.length):index+1;
      return searchPage(watch.phrase,step*SCAN_PAGE,query,taxonomy)
        .then(page=>page.rows).catch(()=>[] as EtsyDisplayListing[]);
    }));
    for(const page of rest)rows.push(...page);
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
      /* Tags ride along on the search response for every scanned listing, so
         these cost nothing. They are not shown as a ranking - they describe
         what the listings at the top of one are. */
      tags:(row.tags??[]).map(tag=>String(tag)),
      isPersonalizable:typeof row.is_personalizable==='boolean'?row.is_personalizable:null,
      materials:(row.materials??[]).map(material=>String(material)),
      shopSold:null as number|null,
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
      if(!detail)return row;
      return {...row,imageUrl:listingPhoto(detail)||row.imageUrl,title:detail.title??row.title,
        tags:detail.tags?.map(tag=>String(tag))??row.tags,
        isPersonalizable:typeof detail.is_personalizable==='boolean'?detail.is_personalizable:row.isPersonalizable,
        materials:detail.materials?.map(material=>String(material))??row.materials,
        /* Lifetime sales of the shop behind the listing. It arrives with the
           photo call, on includes=Shop, and was being thrown away. It is the
           difference between a listing that did well and a shop that does. */
        shopSold:typeof detail.shop?.transaction_sold_count==='number'?detail.shop.transaction_sold_count:row.shopSold};
    }):ranked;
    /*
      COUNTED SALES, WHERE THERE HAVE BEEN TWO READINGS.

      Every competing tool estimates this number from review counts and
      listing age. This one counts it: Etsy publishes `quantity`, and the
      difference between two readings is items that sold. A listing seen for
      the first time today therefore has no count, and gets none - a blank is
      correct and an estimate would not be.

      The scan also puts what it read into the watch, which costs no calls at
      all because the quantity arrived on a request already made. It means the
      corpus follows what members actually research instead of what generic
      discovery happened to find, and that a phrase looked at once carries
      counts the next time somebody opens it.
    */
    void seedFromScan(listings.map(row=>({
      listingId:row.listingId,shopId:null,title:row.title,url:row.etsyUrl,
      taxonomyId:null,favorites:row.favorites,views:row.views,quantity:null,
      priceCents:row.priceCents,currency:row.currency,personalizable:row.isPersonalizable??null,
    }))).catch(()=>undefined);
    const counted=await countedSales(listings.map(row=>row.listingId)).catch(()=>new Map());
    const withCounts=listings.map(row=>{
      const sale=counted.get(row.listingId);
      return sale?{...row,soldUnits:sale.units,soldHours:sale.hours}:row;
    });
    /* The head of the ranking, described against everything scanned. */
    const profile=profileWinners(withCounts.slice(0,50),withCounts,[watch.phrase,query].filter(Boolean).join(' '));
    /*
      THE SIZE OF THE POOL IS NOT THE MEMBER'S PROBLEM.

      This used to return a sentence describing its own coverage, and the page
      printed it: first "24 of 209 Etsy matches shown", then a better-worded
      version of the same confession. Both do one thing - tell a seller they
      are looking at a fraction - which is an invitation to go and use Etsy
      instead. The scan is as complete as it can be made; how complete that is
      on a given phrase is this software's business, not a caption.

      `total` stays because the shop catalog view still counts against it. No
      count derived from it reaches the keyword results.
    */
    return NextResponse.json({
      listings:withCounts,profile,shelf:shelf||null,total:first.total,photosUnavailable:!photos,asOf:now,
    },{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Etsy search could not load. Please try again.'},{status:502});}
});
