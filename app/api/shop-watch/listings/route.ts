import { crossSiteWrite,CROSS_SITE_REFUSAL } from "@/app/same-site-only";
import { NextResponse } from "next/server";
import { env } from "cloudflare:workers";
import { requireFeatureApi } from "@/app/require-feature";
import { withErrorLog } from "@/app/error-log";
import { etsyApiCredential,recordEtsyCall,waitForEtsyCapacity } from "@/app/api/etsy/client";
import { listingDisplay,listingPhoto,listingPrice } from "@/app/etsy-listing-display";

export const GET=withErrorLog("shop-watch-listings",async(request:Request)=>{
  if(crossSiteWrite(request))return NextResponse.json(CROSS_SITE_REFUSAL,{status:403});
  const access=await requireFeatureApi("marketWatch");
  if(!access.ok)return access.response;
  const shopId=Number(new URL(request.url).searchParams.get("shop"));
  if(!Number.isSafeInteger(shopId)||shopId<=0)return NextResponse.json({error:"Choose a watched shop."},{status:400});
  const db=(env as unknown as {DB:D1Database}).DB;
  const watched=await db.prepare("SELECT shop_id FROM member_shop_watches WHERE user_id=? AND shop_id=? AND paused=0")
    .bind(access.user.userId,shopId).first();
  if(!watched)return NextResponse.json({error:"This shop is not on your watchlist."},{status:404});
  await db.prepare("CREATE TABLE IF NOT EXISTS shop_watch_listing_display (shop_id INTEGER PRIMARY KEY,payload TEXT NOT NULL,refreshed_at INTEGER NOT NULL)").run();
  const now=Math.floor(Date.now()/1000);
  const cached=await db.prepare("SELECT payload,refreshed_at FROM shop_watch_listing_display WHERE shop_id=?").bind(shopId).first<{payload:string;refreshed_at:number}>();
  if(cached&&now-cached.refreshed_at<21600)return NextResponse.json(JSON.parse(cached.payload));
  try{
    await waitForEtsyCapacity();
    const response=await fetch(`https://openapi.etsy.com/v3/application/shops/${shopId}/listings/active?limit=24`,{headers:{"x-api-key":etsyApiCredential()},signal:AbortSignal.timeout(25000)});
    await recordEtsyCall(response,"shop-watch");
    if(!response.ok)throw new Error("Etsy could not load this shop's listings. Please try again.");
    const body=await response.json() as {results?:Array<{listing_id:number}>};
    const details=await listingDisplay((body.results??[]).map(row=>row.listing_id),"shop-watch");
    const listings=await Promise.all([...details.values()].filter(row=>Number(row.shop_id)===shopId).map(async row=>{
      const reviews=await db.prepare("SELECT COUNT(*) AS count FROM shop_reviews WHERE shop_id=? AND listing_id=?").bind(shopId,row.listing_id).first<{count:number}>();
      return {listingId:row.listing_id,title:row.title,imageUrl:listingPhoto(row),etsyUrl:`https://www.etsy.com/listing/${row.listing_id}`,priceCents:listingPrice(row),currency:row.price?.currency_code??"USD",favorites:row.num_favorers??null,views:row.views??null,ageDays:row.original_creation_timestamp?Math.max(0,Math.floor((now-row.original_creation_timestamp)/86400)):null,reviewsOnThisListing:Number(reviews?.count??0),displayFresh:true,intervals:0};
    }));
    const payload={listings,asOf:now};
    await db.prepare("INSERT INTO shop_watch_listing_display(shop_id,payload,refreshed_at) VALUES(?,?,?) ON CONFLICT(shop_id) DO UPDATE SET payload=excluded.payload,refreshed_at=excluded.refreshed_at").bind(shopId,JSON.stringify(payload),now).run();
    return NextResponse.json(payload);
  }catch(error){
    if(cached)return NextResponse.json({...JSON.parse(cached.payload),stale:true});
    return NextResponse.json({error:error instanceof Error?error.message:"Listings could not load. Try again."},{status:502});
  }
});
