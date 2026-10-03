import {NextResponse} from "next/server";
import {env} from "cloudflare:workers";
import {withErrorLog} from "@/app/error-log";
import {requireFeatureApi} from "@/app/require-feature";
import {isQaReviewer} from "@/app/qa-reviewer";
import {crossSiteWrite,CROSS_SITE_REFUSAL} from "@/app/same-site-only";
import {etsyConnection,etsyFetch} from "@/app/api/etsy/client";
import {variationVotes,repeatBuyers,boughtTogether,giftOrders,buyerPlaces,lastYearWindow,gainingFavorites,
  type OrderSignal,type SaleVariation,type ReviewPhoto,type Snapshot} from "@/app/shop-map/votes-signals-model.ts";

/*
  VOTES FROM ORDERS AND REVIEWS (Opportunity Engine, Votes page).

  POST syncs, GET reads. The page calls GET, and calls POST only when GET says
  the stored signals are more than a day old, then reads again.

  BUYER PRIVACY (Brittany, 3 Oct 2026): a receipt contributes a one-way buyer
  code (HMAC of the Etsy buyer id), state/region and country, the gift flag
  and whether a gift message exists. Names, addresses, emails and message
  text are never read into storage. See votes-signals-model.ts.

  Correctness does not depend on this sync having run: GET reports how many
  orders the figures cover, and each section says so when there are none.
*/
const noStore={"Cache-Control":"private, no-store"};
const DAY=86_400;
const db=()=> (env as unknown as {DB:D1Database}).DB;

async function ensureSignalTables(d:D1Database){
  await d.batch([
    d.prepare(`CREATE TABLE IF NOT EXISTS shop_map_order_signals (user_id TEXT NOT NULL, shop_id INTEGER NOT NULL, receipt_id INTEGER NOT NULL,
      buyer_key TEXT, country TEXT, region TEXT, is_gift INTEGER NOT NULL DEFAULT 0, gift_message INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, PRIMARY KEY (user_id, shop_id, receipt_id))`),
    d.prepare(`CREATE TABLE IF NOT EXISTS shop_map_sale_variations (user_id TEXT NOT NULL, shop_id INTEGER NOT NULL, transaction_id INTEGER NOT NULL,
      receipt_id INTEGER NOT NULL, listing_id INTEGER NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, variations_json TEXT NOT NULL DEFAULT '[]',
      sold_at INTEGER NOT NULL, PRIMARY KEY (user_id, shop_id, transaction_id))`),
    d.prepare(`CREATE TABLE IF NOT EXISTS shop_map_review_photos (user_id TEXT NOT NULL, shop_id INTEGER NOT NULL, transaction_id INTEGER NOT NULL,
      listing_id INTEGER, rating INTEGER, image_url TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, shop_id, transaction_id))`),
    d.prepare(`CREATE TABLE IF NOT EXISTS shop_map_favorite_snapshots (user_id TEXT NOT NULL, shop_id INTEGER NOT NULL, listing_id INTEGER NOT NULL,
      day TEXT NOT NULL, favorites INTEGER NOT NULL, PRIMARY KEY (user_id, shop_id, listing_id, day))`),
    d.prepare(`CREATE TABLE IF NOT EXISTS shop_map_signal_state (user_id TEXT NOT NULL, shop_id INTEGER NOT NULL, refreshed_at INTEGER NOT NULL,
      receipts INTEGER NOT NULL DEFAULT 0, oldest_at INTEGER, PRIMARY KEY (user_id, shop_id))`),
  ]);
}

async function buyerKey(shopId:number,buyerId:unknown){
  const id=Number(buyerId);if(!Number.isSafeInteger(id)||id<=0)return null;
  const secret=String((env as unknown as {ETSY_TOKEN_KEY?:string}).ETSY_TOKEN_KEY??"")+`:shop:${shopId}`;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const mac=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`buyer:${id}`));
  return [...new Uint8Array(mac)].slice(0,12).map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

async function activeShop(userId:string){
  return db().prepare("SELECT shop_id FROM etsy_connections WHERE user_id=? AND is_active=1 LIMIT 1").bind(userId).first<{shop_id:number}>();
}

const today=()=>new Date().toISOString().slice(0,10);

/* One snapshot per listing per day, from the stored catalog. Gains need a week of these. */
async function snapshotFavorites(userId:string,shopId:number){
  const d=db();
  await d.prepare(`INSERT OR IGNORE INTO shop_map_favorite_snapshots (user_id,shop_id,listing_id,day,favorites)
    SELECT user_id,shop_id,listing_id,?,favorites FROM shop_map_listings
     WHERE user_id=? AND shop_id=? AND state='active' AND favorites IS NOT NULL`).bind(today(),userId,shopId).run();
}

export const GET=withErrorLog("shop-map-votes-signals",async()=>{
  if(await isQaReviewer())return NextResponse.json({empty:true},{headers:noStore});
  const access=await requireFeatureApi("shopMap");if(!access.ok)return access.response;
  const userId=access.user.userId;
  const shop=await activeShop(userId);if(!shop)return NextResponse.json({empty:true},{headers:noStore});
  const d=db();const shopId=Number(shop.shop_id);
  await ensureSignalTables(d);
  await snapshotFavorites(userId,shopId);
  const now=Math.floor(Date.now()/1000),year=now-365*DAY;

  const state=await d.prepare("SELECT refreshed_at,receipts,oldest_at FROM shop_map_signal_state WHERE user_id=? AND shop_id=?")
    .bind(userId,shopId).first<{refreshed_at:number;receipts:number;oldest_at:number|null}>();
  const orders=((await d.prepare(`SELECT receipt_id,buyer_key,country,region,is_gift,gift_message,created_at FROM shop_map_order_signals
      WHERE user_id=? AND shop_id=? AND created_at>=?`).bind(userId,shopId,now-400*DAY).all<Record<string,unknown>>()).results??[])
    .map(row=>({receiptId:Number(row.receipt_id),buyerKey:row.buyer_key?String(row.buyer_key):null,country:row.country?String(row.country):null,
      region:row.region?String(row.region):null,isGift:Number(row.is_gift)===1,giftMessage:Number(row.gift_message)===1,createdAt:Number(row.created_at)}) as OrderSignal);
  const sales=((await d.prepare(`SELECT transaction_id,receipt_id,listing_id,quantity,variations_json,sold_at FROM shop_map_sale_variations
      WHERE user_id=? AND shop_id=? AND sold_at>=?`).bind(userId,shopId,now-400*DAY).all<Record<string,unknown>>()).results??[])
    .map(row=>{let variations:Array<{name:string;value:string}>=[];try{variations=JSON.parse(String(row.variations_json||"[]"))}catch{/* empty */}
      return {transactionId:Number(row.transaction_id),receiptId:Number(row.receipt_id),listingId:Number(row.listing_id),
        quantity:Number(row.quantity||1),variations,soldAt:Number(row.sold_at)} as SaleVariation});
  const photos=((await d.prepare(`SELECT transaction_id,listing_id,rating,image_url,created_at FROM shop_map_review_photos
      WHERE user_id=? AND shop_id=? ORDER BY created_at DESC LIMIT 12`).bind(userId,shopId).all<Record<string,unknown>>()).results??[])
    .map(row=>({transactionId:Number(row.transaction_id),listingId:row.listing_id==null?null:Number(row.listing_id),
      rating:row.rating==null?null:Number(row.rating),imageUrl:String(row.image_url),createdAt:Number(row.created_at)}) as ReviewPhoto);
  /* Last year at this time reads the full sales history, which the finance sync already keeps. */
  const history=((await d.prepare(`SELECT listing_id,quantity,sold_at FROM shop_map_listing_sales
      WHERE user_id=? AND shop_id=? AND refunded=0 AND sold_at>=? AND sold_at<?`).bind(userId,shopId,now-366*DAY,now-334*DAY)
    .all<Record<string,unknown>>()).results??[]).map(row=>({listingId:Number(row.listing_id),quantity:Number(row.quantity||0),soldAt:Number(row.sold_at)}));
  const oldestSale=await d.prepare("SELECT MIN(sold_at) AS oldest FROM shop_map_listing_sales WHERE user_id=? AND shop_id=?").bind(userId,shopId).first<{oldest:number|null}>();
  const snapshots=((await d.prepare(`SELECT listing_id,day,favorites FROM shop_map_favorite_snapshots WHERE user_id=? AND shop_id=? AND day>=?`)
    .bind(userId,shopId,new Date((now-40*DAY)*1000).toISOString().slice(0,10)).all<Record<string,unknown>>()).results??[])
    .map(row=>({listingId:Number(row.listing_id),day:String(row.day),favorites:Number(row.favorites)}) as Snapshot);
  const current=((await d.prepare(`SELECT listing_id,favorites FROM shop_map_listings WHERE user_id=? AND shop_id=? AND state='active'`)
    .bind(userId,shopId).all<Record<string,unknown>>()).results??[]).map(row=>({listingId:Number(row.listing_id),favorites:row.favorites==null?null:Number(row.favorites)}));

  const recentOrders=orders.filter(order=>order.createdAt>=year);
  return NextResponse.json({
    refreshedAt:state?.refreshed_at??null,stale:!state||Number(state.refreshed_at)<now-20*3600,
    coverage:{orders:recentOrders.length,since:year},
    variations:variationVotes(sales,year),
    repeat:repeatBuyers(recentOrders,sales.filter(sale=>sale.soldAt>=year)),
    together:boughtTogether(sales,year),
    gifts:giftOrders(orders,year),
    places:buyerPlaces(orders,year),
    lastYear:{...lastYearWindow(history,now),covered:Boolean(oldestSale?.oldest&&Number(oldestSale.oldest)<=now-365*DAY)},
    photos,
    gaining:gainingFavorites(snapshots,current,today()),
  },{headers:noStore});
});

export const POST=withErrorLog("shop-map-votes-signals-sync",async(request:Request)=>{
  if(crossSiteWrite(request))return NextResponse.json(CROSS_SITE_REFUSAL,{status:403,headers:noStore});
  if(await isQaReviewer())return NextResponse.json({synced:false},{headers:noStore});
  const access=await requireFeatureApi("shopMap");if(!access.ok)return access.response;
  const userId=access.user.userId;
  const d=db();await ensureSignalTables(d);
  let connection:Awaited<ReturnType<typeof etsyConnection>>;
  try{connection=await etsyConnection(userId)}catch{return NextResponse.json({synced:false,reason:"Etsy is not connected."},{headers:noStore})}
  const shopId=Number(connection.shopId);const now=Math.floor(Date.now()/1000);
  const state=await d.prepare("SELECT refreshed_at FROM shop_map_signal_state WHERE user_id=? AND shop_id=?").bind(userId,shopId).first<{refreshed_at:number}>();
  /* First sync reaches back 13 months; later ones stop a week behind the last one. */
  const stopAt=state?Number(state.refreshed_at)-7*DAY:now-395*DAY;
  let receipts=0,oldest=now,photos=0,listingsSeen=0;

  for(let page=0;page<20;page++){
    let body:{results?:Array<Record<string,unknown>>};
    try{body=await etsyFetch(`/shops/${shopId}/receipts?limit=100&offset=${page*100}`,connection.token,"finance")}catch{break}
    const rows=body.results??[];if(!rows.length)break;
    const writes:D1PreparedStatement[]=[];
    for(const receipt of rows){
      const receiptId=Number(receipt.receipt_id??0);if(!receiptId)continue;
      const created=Number(receipt.created_timestamp??receipt.create_timestamp??0);
      if(created<oldest)oldest=created;
      if(receipt.is_paid===false||/^(canceled|cancelled)$/i.test(String(receipt.status??"")))continue;
      writes.push(d.prepare(`INSERT INTO shop_map_order_signals (user_id,shop_id,receipt_id,buyer_key,country,region,is_gift,gift_message,created_at)
        VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,shop_id,receipt_id) DO UPDATE SET buyer_key=excluded.buyer_key,country=excluded.country,
        region=excluded.region,is_gift=excluded.is_gift,gift_message=excluded.gift_message,created_at=excluded.created_at`)
        .bind(userId,shopId,receiptId,await buyerKey(shopId,receipt.buyer_user_id),
          receipt.country_iso?String(receipt.country_iso).slice(0,2).toUpperCase():null,
          receipt.state?String(receipt.state).slice(0,40):null,
          receipt.is_gift===true?1:0,String(receipt.gift_message??"").trim()?1:0,created));
      receipts++;
      for(const line of (receipt.transactions??[]) as Array<Record<string,unknown>>){
        const transactionId=Number(line.transaction_id),listingId=Number(line.listing_id);
        if(!Number.isSafeInteger(transactionId)||transactionId<=0||!Number.isSafeInteger(listingId)||listingId<=0)continue;
        const variations=((line.variations??[]) as Array<Record<string,unknown>>)
          .map(item=>({name:String(item.formatted_name??"").slice(0,40),value:String(item.formatted_value??"").slice(0,60)})).filter(item=>item.value);
        writes.push(d.prepare(`INSERT INTO shop_map_sale_variations (user_id,shop_id,transaction_id,receipt_id,listing_id,quantity,variations_json,sold_at)
          VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id,shop_id,transaction_id) DO UPDATE SET quantity=excluded.quantity,variations_json=excluded.variations_json`)
          .bind(userId,shopId,transactionId,receiptId,listingId,Math.max(1,Number(line.quantity??1)),JSON.stringify(variations),created));
      }
    }
    for(let offset=0;offset<writes.length;offset+=80)await d.batch(writes.slice(offset,offset+80));
    if(rows.length<100||oldest<stopAt)break;
  }

  /* Buyer photos from reviews. Only the image address and rating are kept. */
  for(let page=0;page<3;page++){
    let body:{results?:Array<Record<string,unknown>>};
    try{body=await etsyFetch(`/shops/${shopId}/reviews?limit=100&offset=${page*100}`,connection.token,"listings")}catch{break}
    const rows=body.results??[];
    const writes=rows.filter(row=>row.image_url_fullxfull&&Number(row.transaction_id)).map(row=>d.prepare(
      `INSERT INTO shop_map_review_photos (user_id,shop_id,transaction_id,listing_id,rating,image_url,created_at) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(user_id,shop_id,transaction_id) DO UPDATE SET image_url=excluded.image_url,rating=excluded.rating`)
      .bind(userId,shopId,Number(row.transaction_id),Number(row.listing_id)||null,row.rating==null?null:Number(row.rating),
        String(row.image_url_fullxfull),Number(row.created_timestamp??row.create_timestamp??0)));
    photos+=writes.length;
    if(writes.length)await d.batch(writes);
    if(rows.length<100)break;
  }

  /* Fresh favorites and views for active listings, so the daily snapshot is today's number. */
  for(let page=0;page<10;page++){
    let body:{results?:Array<Record<string,unknown>>};
    try{body=await etsyFetch(`/shops/${shopId}/listings/active?limit=100&offset=${page*100}`,connection.token,"listings")}catch{break}
    const rows=body.results??[];
    const writes=rows.filter(row=>Number(row.listing_id)).map(row=>d.prepare(
      `UPDATE shop_map_listings SET favorites=COALESCE(?,favorites),views=COALESCE(?,views) WHERE user_id=? AND shop_id=? AND listing_id=?`)
      .bind(typeof row.num_favorers==="number"?row.num_favorers:null,typeof row.views==="number"?row.views:null,userId,shopId,Number(row.listing_id)));
    listingsSeen+=writes.length;
    for(let offset=0;offset<writes.length;offset+=80)await d.batch(writes.slice(offset,offset+80));
    if(rows.length<100)break;
  }
  await d.prepare(`DELETE FROM shop_map_favorite_snapshots WHERE user_id=? AND shop_id=? AND day=?`).bind(userId,shopId,today()).run();
  await snapshotFavorites(userId,shopId);

  await d.prepare(`INSERT INTO shop_map_signal_state (user_id,shop_id,refreshed_at,receipts,oldest_at) VALUES (?,?,?,?,?)
    ON CONFLICT(user_id,shop_id) DO UPDATE SET refreshed_at=excluded.refreshed_at,receipts=shop_map_signal_state.receipts+excluded.receipts,
    oldest_at=MIN(COALESCE(shop_map_signal_state.oldest_at,excluded.oldest_at),excluded.oldest_at)`)
    .bind(userId,shopId,now,receipts,oldest).run();
  return NextResponse.json({synced:true,receipts,photos,listings:listingsSeen},{headers:noStore});
});
