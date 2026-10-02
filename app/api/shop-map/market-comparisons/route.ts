import {NextResponse} from "next/server";
import {env} from "cloudflare:workers";
import {withErrorLog} from "@/app/error-log";
import {requireFeatureApi} from "@/app/require-feature";
import {isQaReviewer} from "@/app/qa-reviewer";
import {etsyConnection,etsyFetch,etsyBudget} from "@/app/api/etsy/client";
import {productFamily} from "@/app/product-type-utils";

type EtsyListing={listing_id:number;shop_id:number;title:string;url?:string;images?:Array<{url_570xN?:string;url_fullxfull?:string}>;materials?:string[];price?:{amount:number;divisor:number;currency_code:string}};
type EtsyReview={created_timestamp?:number;create_timestamp?:number;review?:string;rating?:number};
type Comparison={listingId:number;title:string;url:string;imageUrl:string;price:string|null;reviewCount:number;latestReviewAt:number;difference:string;reviewExcerpt:string|null;observedAt:number};
const stop=new Set("a an and are art as at be by custom design for from gift gifts handmade in is it listing my of on or personalized personalised print shirt shop the this to with women womens your you tee tshirt sweatshirt poster mug".split(" "));
const words=(value:string)=>value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(word=>word.length>2&&!stop.has(word));
const queryFor=(title:string,family:string)=>{
  const main=title.split(/[|–—]/)[0]||title;
  const unique=[...new Set(words(main))].slice(0,5);
  return unique.length>=2?(unique.join(" ")+" "+family).trim().slice(0,90):"";
};
const familyOf=(title:string)=>productFamily(title).toLowerCase();
const cacheControl={"Cache-Control":"private, no-store"};
export const GET=withErrorLog("shop-map-market-comparisons",async(request:Request)=>{
  const listingId=Number(new URL(request.url).searchParams.get("listingId"));
  if(!Number.isSafeInteger(listingId)||listingId<1)return NextResponse.json({error:"Choose a product."},{status:400,headers:cacheControl});
  if(await isQaReviewer())return NextResponse.json({status:"available",query:"synthetic reviewer example",comparisons:listingId===1?[{
    listingId:900007,title:"My Body My Choice Tee — sample comparison",url:"https://www.etsy.com/listing/900007",
    imageUrl:"/qa-artwork-1.svg",price:"USD 32.00",reviewCount:2,
    latestReviewAt:Math.floor(Date.now()/1000)-86400,difference:"The public title emphasizes a statement tee; compare its wording and options with your own.",
    reviewExcerpt:"Reviewer fixture only",observedAt:Math.floor(Date.now()/1000),
  }]:[]},{headers:cacheControl});
  const access=await requireFeatureApi("shopMap");if(!access.ok)return access.response;
  const db=(env as unknown as {DB:D1Database}).DB;
  const shop=await db.prepare("SELECT shop_id FROM etsy_connections WHERE user_id=? AND is_active=1 LIMIT 1").bind(access.user.userId).first<{shop_id:number}>();
  if(!shop)return NextResponse.json({status:"unavailable",comparisons:[]},{headers:cacheControl});
  const own=await db.prepare("SELECT title,product_family FROM shop_map_listings WHERE user_id=? AND shop_id=? AND listing_id=? LIMIT 1")
    .bind(access.user.userId,shop.shop_id,listingId).first<{title:string;product_family:string}>();
  if(!own)return NextResponse.json({status:"unavailable",comparisons:[]},{headers:cacheControl});
  const family=familyOf(own.title)||familyOf(own.product_family);
  const query=queryFor(own.title,family);
  if(!query||!family)return NextResponse.json({status:"insufficient-context",comparisons:[]},{headers:cacheControl});
  await db.prepare("CREATE TABLE IF NOT EXISTS shop_map_market_comparison_cache (user_id TEXT NOT NULL,shop_id INTEGER NOT NULL,listing_id INTEGER NOT NULL,source_title TEXT NOT NULL,payload TEXT NOT NULL,checked_at INTEGER NOT NULL,PRIMARY KEY(user_id,shop_id,listing_id))").run();
  const now=Math.floor(Date.now()/1000);
  const cached=await db.prepare("SELECT payload,checked_at,source_title FROM shop_map_market_comparison_cache WHERE user_id=? AND shop_id=? AND listing_id=?")
    .bind(access.user.userId,shop.shop_id,listingId).first<{payload:string;checked_at:number;source_title:string}>();
  if(cached&&cached.source_title===own.title&&now-cached.checked_at<12*3600)
    return NextResponse.json(JSON.parse(cached.payload),{headers:cacheControl});
  const budget=await etsyBudget();
  if(budget.remaining<7)return NextResponse.json({status:"unavailable",reason:"Etsy request capacity is reserved for shop operations.",comparisons:[]},{headers:cacheControl});
  try{
    const connection=await etsyConnection(access.user.userId);
    // Only the concise, derived search phrase leaves Goldie. Purchase, revenue and review data do not.
    const search=await etsyFetch<{results:EtsyListing[]}>("/listings/active?keywords="+encodeURIComponent(query)+"&limit=25&sort_on=score",connection.token,"search");
    const ownWords=new Set(words(own.title));
    const candidates=(search.results||[]).filter(row=>row.shop_id!==shop.shop_id&&row.listing_id!==listingId
      &&familyOf(row.title)===family&&words(row.title).filter(word=>ownWords.has(word)).length>=2).slice(0,3);
    const comparisons:Comparison[]=[];
    for(const candidate of candidates){
      const id=Number(candidate.listing_id);
      try{
        const [listing,reviews]=await Promise.all([
          etsyFetch<EtsyListing>("/listings/"+id+"?includes=Images",connection.token,"search"),
          etsyFetch<{count:number;results:EtsyReview[]}>("/listings/"+id+"/reviews?limit=5",connection.token,"search"),
        ]);
        const latest=(reviews.results||[]).map(row=>Number(row.created_timestamp||row.create_timestamp||0)).sort((a,b)=>b-a)[0]||0;
        const image=listing.images?.[0]?.url_570xN||listing.images?.[0]?.url_fullxfull||"";
        if(!image||!latest||!reviews.count)continue;
        const distinct=words(listing.title).find(word=>!ownWords.has(word));
        const material=listing.materials?.find(value=>value&&!own.title.toLowerCase().includes(value.toLowerCase()));
        const difference=material?"The comparison lists "+material+" as a material; check how its options and buyer use compare with yours.":
          distinct?"The comparison emphasizes “"+distinct+"” in its title; inspect whether that buyer angle fits an original test.":
          "Compare the visible wording, product options, materials and buyer use before testing a distinct version.";
        const price=listing.price&&listing.price.divisor>0
          ?listing.price.currency_code+" "+(listing.price.amount/listing.price.divisor).toFixed(2):null;
        const review=(reviews.results||[]).find(row=>row.review?.trim());
        comparisons.push({listingId:id,title:listing.title,url:listing.url||"https://www.etsy.com/listing/"+id,
          imageUrl:image,price,reviewCount:reviews.count,latestReviewAt:latest,difference,
          reviewExcerpt:review?.review?.trim().slice(0,180)||null,observedAt:now});
      }catch{continue}
    }
    comparisons.sort((a,b)=>b.latestReviewAt-a.latestReviewAt||b.reviewCount-a.reviewCount);
    const payload={status:comparisons.length?"available":"no-reviewed-match",query,comparisons:comparisons.slice(0,2),checkedAt:now};
    await db.prepare("INSERT INTO shop_map_market_comparison_cache (user_id,shop_id,listing_id,source_title,payload,checked_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,shop_id,listing_id) DO UPDATE SET source_title=excluded.source_title,payload=excluded.payload,checked_at=excluded.checked_at")
      .bind(access.user.userId,shop.shop_id,listingId,own.title,JSON.stringify(payload),now).run();
    return NextResponse.json(payload,{headers:cacheControl});
  }catch{return NextResponse.json({status:"unavailable",comparisons:[]},{headers:cacheControl})}
});
