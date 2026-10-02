import {NextResponse} from "next/server";
import {env} from "cloudflare:workers";
import {withErrorLog} from "@/app/error-log";
import {requireFeatureApi} from "@/app/require-feature";
import {isQaReviewer} from "@/app/qa-reviewer";
import {crossSiteWrite,CROSS_SITE_REFUSAL} from "@/app/same-site-only";
import {reserveSpend,settleSpend,failSpend,releaseSpend} from "@/app/spend-guard";
import {recordVisionCall} from "@/app/vision-telemetry";
import {DESIGN_READ_PROMPT,parseDesignRead,type DesignRead} from "@/app/shop-map/opportunity-engine-model";

/*
  WHAT IS PRINTED ON EACH LISTING PHOTO.

  Etsy titles are search keywords, not a description of the artwork, so the
  Opportunity Engine reads the design from the listing's own main photo.

  - The photo address comes from the member's synced listing row, never from
    the request, and must be on Etsy's image host.
  - One read per listing and photo. A stored read is reused until the main
    photo changes, so a shop pays once.
  - Every paid read goes through the spend guard (shopListingDesignRead).
*/
const WORKLOAD="shopListingDesignRead";
const MODEL="google/gemini-2.5-flash";
const MAX_PER_REQUEST=12;
const noStore={"Cache-Control":"private, no-store"};

async function ensureTable(db:D1Database){
  await db.prepare(`CREATE TABLE IF NOT EXISTS shop_map_listing_designs (
    user_id TEXT NOT NULL, shop_id INTEGER NOT NULL, listing_id INTEGER NOT NULL,
    image_url TEXT NOT NULL, read_json TEXT NOT NULL, model TEXT NOT NULL, read_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, shop_id, listing_id))`).run();
}

const etsyImage=(url:string)=>{try{const u=new URL(url);return u.protocol==="https:"&&u.hostname==="i.etsystatic.com"}catch{return false}};

export const POST=withErrorLog("shop-map-listing-designs",async(request:Request)=>{
  if(crossSiteWrite(request))return NextResponse.json(CROSS_SITE_REFUSAL,{status:403,headers:noStore});
  if(await isQaReviewer())return NextResponse.json({reads:[],pending:0},{headers:noStore});
  const access=await requireFeatureApi("shopMap");if(!access.ok)return access.response;
  const userId=access.user.userId;
  const body=await request.json().catch(()=>null) as {listingIds?:unknown}|null;
  const ids=[...new Set((Array.isArray(body?.listingIds)?body!.listingIds:[]).map(Number)
    .filter(id=>Number.isSafeInteger(id)&&id>0))].slice(0,60);
  if(!ids.length)return NextResponse.json({reads:[],pending:0},{headers:noStore});

  const db=(env as unknown as {DB:D1Database}).DB;
  const shop=await db.prepare("SELECT shop_id FROM etsy_connections WHERE user_id=? AND is_active=1 LIMIT 1")
    .bind(userId).first<{shop_id:number}>();
  if(!shop)return NextResponse.json({reads:[],pending:0},{headers:noStore});
  await ensureTable(db);
  const marks=ids.map(()=>"?").join(",");
  const listings=(await db.prepare(`SELECT listing_id,image_url FROM shop_map_listings WHERE user_id=? AND shop_id=? AND listing_id IN (${marks})`)
    .bind(userId,shop.shop_id,...ids).all<{listing_id:number;image_url:string|null}>()).results??[];
  const stored=(await db.prepare(`SELECT listing_id,image_url,read_json FROM shop_map_listing_designs WHERE user_id=? AND shop_id=? AND listing_id IN (${marks})`)
    .bind(userId,shop.shop_id,...ids).all<{listing_id:number;image_url:string;read_json:string}>()).results??[];
  const storedBy=new Map(stored.map(row=>[Number(row.listing_id),row]));

  const reads:DesignRead[]=[];
  const toRead:Array<{listingId:number;imageUrl:string}>=[];
  for(const id of ids){
    const listing=listings.find(row=>Number(row.listing_id)===id);
    const imageUrl=String(listing?.image_url??"");
    const saved=storedBy.get(id);
    if(saved&&(!imageUrl||saved.image_url===imageUrl)){try{reads.push(JSON.parse(saved.read_json) as DesignRead)}catch{/* unreadable row is re-read below */}continue}
    if(imageUrl&&etsyImage(imageUrl))toRead.push({listingId:id,imageUrl});
  }

  const key=process.env.FAL_KEY??"";
  const batch=key?toRead.slice(0,MAX_PER_REQUEST):[];
  let stopped=false;
  const readOne=async(item:{listingId:number;imageUrl:string})=>{
    if(stopped)return;
    const reservation=await reserveSpend({workloadKey:WORKLOAD,userId,consumesAllowance:false,fingerprint:`${userId}:${item.listingId}:${item.imageUrl}`});
    if(!reservation.allowed){stopped=true;return}
    const began=Date.now();let billed=0;
    try{
      const response=await fetch("https://fal.run/openrouter/router/vision",{method:"POST",
        headers:{Authorization:`Key ${key}`,"Content-Type":"application/json"},
        body:JSON.stringify({model:MODEL,temperature:0,max_tokens:300,
          system_prompt:"Return only compact valid JSON. Never use markdown.",prompt:DESIGN_READ_PROMPT,image_urls:[item.imageUrl]}),
        signal:AbortSignal.timeout(60_000)});
      const payload=await response.json() as {output?:string;usage?:{cost?:number;prompt_tokens?:number;completion_tokens?:number};detail?:string};
      billed=Number(payload.usage?.cost??0);
      const read=response.ok?parseDesignRead(item.listingId,String(payload.output??"")):null;
      await recordVisionCall({userId,purpose:"shop-listing-design",model:MODEL,
        usage:{input_tokens:Number(payload.usage?.prompt_tokens??0),output_tokens:Number(payload.usage?.completion_tokens??0)},
        milliseconds:Date.now()-began,attempts:1,validJson:Boolean(read),failure:read?"":(payload.detail??"unreadable reply")}).catch(()=>{});
      if(!read){await failSpend(reservation.id,{billed});return}
      await settleSpend(reservation.id,billed||0.004);
      await db.prepare(`INSERT INTO shop_map_listing_designs (user_id,shop_id,listing_id,image_url,read_json,model,read_at) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(user_id,shop_id,listing_id) DO UPDATE SET image_url=excluded.image_url,read_json=excluded.read_json,model=excluded.model,read_at=excluded.read_at`)
        .bind(userId,shop.shop_id,item.listingId,item.imageUrl,JSON.stringify(read),MODEL,Math.floor(Date.now()/1000)).run();
      reads.push(read);
    }catch{
      if(billed)await failSpend(reservation.id,{billed});else await releaseSpend(reservation.id);
    }
  };
  /* Four at a time keeps a first visit to about fifteen seconds. */
  for(let index=0;index<batch.length;index+=4)await Promise.all(batch.slice(index,index+4).map(readOne));
  const done=new Set(reads.map(read=>read.listingId));
  return NextResponse.json({reads,pending:toRead.filter(item=>!done.has(item.listingId)).length,limited:stopped},{headers:noStore});
});
