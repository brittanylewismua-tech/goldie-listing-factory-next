import {NextResponse} from "next/server";
import {env} from "cloudflare:workers";
import {withErrorLog} from "@/app/error-log";
import {requireFeatureApi} from "@/app/require-feature";
import {isQaReviewer} from "@/app/qa-reviewer";
import {crossSiteWrite,CROSS_SITE_REFUSAL} from "@/app/same-site-only";
import {reserveSpend,settleSpend,failSpend,releaseSpend} from "@/app/spend-guard";
import {recordFalUsage} from "@/app/fal-usage";
import {BUYER_WORDS_PROMPT,countPhrases,parsePhrases} from "@/app/shop-map/buyer-words-model";

/*
  BUYERS' OWN WORDS (Opportunity Engine, Votes page).

  A model proposes the phrases buyers use in the shop's recent reviews; the
  COUNTS are then made here by matching those phrases against the review
  text, so a number on the page is never the model's guess. A phrase found in
  fewer than two reviews is dropped. One read per shop until a new review
  arrives (workload shopBuyerWords).
*/
const WORKLOAD="shopBuyerWords";
const MODEL="google/gemini-2.5-flash";
const noStore={"Cache-Control":"private, no-store"};

export const POST=withErrorLog("shop-map-buyer-words",async(request:Request)=>{
  if(crossSiteWrite(request))return NextResponse.json(CROSS_SITE_REFUSAL,{status:403,headers:noStore});
  if(await isQaReviewer())return NextResponse.json({phrases:[],reviews:0},{headers:noStore});
  const access=await requireFeatureApi("shopMap");if(!access.ok)return access.response;
  const userId=access.user.userId;
  const db=(env as unknown as {DB:D1Database}).DB;
  const shop=await db.prepare("SELECT shop_id FROM etsy_connections WHERE user_id=? AND is_active=1 LIMIT 1").bind(userId).first<{shop_id:number}>();
  if(!shop)return NextResponse.json({phrases:[],reviews:0},{headers:noStore});
  const shopId=Number(shop.shop_id);
  await db.prepare(`CREATE TABLE IF NOT EXISTS shop_map_buyer_words (user_id TEXT NOT NULL, shop_id INTEGER NOT NULL,
    newest_at INTEGER NOT NULL, reviews INTEGER NOT NULL, phrases_json TEXT NOT NULL, model TEXT NOT NULL, read_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, shop_id))`).run();
  const rows=((await db.prepare(`SELECT review,created_at FROM shop_map_own_reviews WHERE user_id=? AND shop_id=? AND TRIM(review)<>''
    ORDER BY created_at DESC LIMIT 200`).bind(userId,shopId).all<{review:string;created_at:number}>()).results??[]);
  if(rows.length<10)return NextResponse.json({phrases:[],reviews:rows.length},{headers:noStore});
  const newest=Number(rows[0].created_at);const texts=rows.map(row=>String(row.review));
  const cached=await db.prepare("SELECT newest_at,reviews,phrases_json FROM shop_map_buyer_words WHERE user_id=? AND shop_id=?")
    .bind(userId,shopId).first<{newest_at:number;reviews:number;phrases_json:string}>();
  if(cached&&Number(cached.newest_at)===newest){
    let proposed:string[]=[];try{proposed=JSON.parse(cached.phrases_json)}catch{/* re-read below */}
    if(proposed.length)return NextResponse.json({phrases:countPhrases(proposed,texts),reviews:texts.length},{headers:noStore});
  }
  const key=process.env.FAL_KEY??"";
  if(!key)return NextResponse.json({phrases:[],reviews:texts.length},{headers:noStore});
  const reservation=await reserveSpend({workloadKey:WORKLOAD,userId,consumesAllowance:false,fingerprint:`${userId}:${shopId}:${newest}`});
  if(!reservation.allowed)return NextResponse.json({phrases:[],reviews:texts.length,limited:true},{headers:noStore});
  let billed=0;
  try{
    const response=await fetch("https://fal.run/openrouter/router",{method:"POST",
      headers:{Authorization:`Key ${key}`,"Content-Type":"application/json"},
      body:JSON.stringify({model:MODEL,temperature:0,max_tokens:400,system_prompt:"Return only compact valid JSON. Never use markdown.",
        prompt:BUYER_WORDS_PROMPT+"\n\nREVIEWS:\n"+texts.map((text,index)=>`${index+1}. ${text.replace(/\s+/g," ").slice(0,400)}`).join("\n")}),
      signal:AbortSignal.timeout(60_000)});
    const payload=await response.json() as {output?:string;usage?:{cost?:number;prompt_tokens?:number;completion_tokens?:number}};
    billed=Number(payload.usage?.cost??0);
    const proposed=response.ok?parsePhrases(String(payload.output??"")):[];
    await recordFalUsage({workload:WORKLOAD,model:MODEL,cost:billed,inputTokens:Number(payload.usage?.prompt_tokens??0),
      outputTokens:Number(payload.usage?.completion_tokens??0)}).catch(()=>{});
    if(!proposed.length){await failSpend(reservation.id,{billed});return NextResponse.json({phrases:[],reviews:texts.length},{headers:noStore})}
    await settleSpend(reservation.id,billed||0.002);
    await db.prepare(`INSERT INTO shop_map_buyer_words (user_id,shop_id,newest_at,reviews,phrases_json,model,read_at) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(user_id,shop_id) DO UPDATE SET newest_at=excluded.newest_at,reviews=excluded.reviews,phrases_json=excluded.phrases_json,
      model=excluded.model,read_at=excluded.read_at`).bind(userId,shopId,newest,texts.length,JSON.stringify(proposed),MODEL,Math.floor(Date.now()/1000)).run();
    return NextResponse.json({phrases:countPhrases(proposed,texts),reviews:texts.length},{headers:noStore});
  }catch{
    if(billed)await failSpend(reservation.id,{billed});else await releaseSpend(reservation.id);
    return NextResponse.json({phrases:[],reviews:texts.length},{headers:noStore});
  }
});
