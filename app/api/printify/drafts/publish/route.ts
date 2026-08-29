import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { monthKey, planFor } from "@/app/plan-limits";
import { drainGlobalPublishQueue, publishJobPayload } from "./queue";
import { isOwner } from "@/app/mastermind/access";
import { verifyShopPairing, shopMismatch } from "../../shop-match";
import { decryptPrintifyToken } from "../../token-crypto";
import { etsyConnection, etsyFetch } from "@/app/api/etsy/client";

export async function POST(request:Request){
  const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to publish these listings."},{status:401});
  const body=await request.json() as {productIds?:string[];printifyImageIndices?:number[];printifyImageSelections?:Record<string,number[]>;etsyShippingProfileId?:number;byProduct?:Record<string,{indices?:number[];selections?:number[];shippingProfileId?:number}>},ids=[...new Set((body.productIds||[]).map(String).filter(Boolean))],etsyShippingProfileId=Number(body.etsyShippingProfileId);
  if(!ids.length)return NextResponse.json({error:"Choose at least one completed listing."},{status:400});
  /* D643 - built here so a retry can refresh the job before anything returns early. */
  const settingsJson=JSON.stringify({printifyImageIndices:[...new Set((body.printifyImageIndices||[]).map(Number).filter(Number.isInteger))],printifyImageSelections:body.printifyImageSelections||{},etsyShippingProfileId,byProduct:Object.fromEntries(Object.entries(body.byProduct||{}).map(([productId,entry])=>[String(productId),{indices:Array.isArray(entry?.indices)?entry.indices.map(Number).filter(Number.isInteger):undefined,selections:Array.isArray(entry?.selections)?entry.selections.map(Number).filter(Number.isInteger):undefined,shippingProfileId:Number(entry?.shippingProfileId)||undefined}]))});if(!Number.isInteger(etsyShippingProfileId)||etsyShippingProfileId<=0)return NextResponse.json({error:"Choose an Etsy shipping profile before publishing."},{status:400});
  const rows=await env.DB.prepare(`SELECT response_json FROM printify_draft_results WHERE user_id=? AND status='succeeded' AND json_extract(response_json,'$.id') IN (${ids.map(()=>"?").join(",")})`).bind(user.userId,...ids).all<{response_json:string}>();if(rows.results.length!==ids.length)return NextResponse.json({error:"One or more listings do not belong to this Listing Factory account."},{status:403});
  /* D475 - pressing Publish again could not retry a failed listing. If any one
     item was still queued, the `existing` check below returned the old job
     immediately and never reached the upsert that re-queues the rest, so the
     failed ones stayed failed forever. And even when it did reach the upsert,
     attempts was never reset, so a listing that had used up its retries could
     never be tried again. Her retry is now a real retry. */
  await env.DB.prepare(`UPDATE etsy_publish_items SET status='queued',attempts=0,available_at=0,locked_at=NULL,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND status='failed' AND product_id IN (${ids.map(()=>"?").join(",")})`).bind(user.userId,...ids).run();
  /* D476 - D475 re-queued the failed items but left the job row saying
     needs_attention. That status is terminal: the GET below refuses to run the
     queue on a terminal job, and the browser stops polling the moment it sees
     one. So publish spun for a second and stopped without attempting anything,
     and the failure panel was empty because the items were no longer failed.
     Re-queuing an item has to revive its job in the same breath. */
  await env.DB.prepare(`UPDATE etsy_publish_jobs SET status='processing',failed=0,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id IN (SELECT DISTINCT job_id FROM etsy_publish_items WHERE user_id=? AND status IN ('queued','running') AND product_id IN (${ids.map(()=>"?").join(",")}))`).bind(user.userId,user.userId,...ids).run();
  /* D643 · A publish press could never change a job's settings. Line order did
     it: the re-queue above flips failed items to 'queued', the `existing` check
     below then finds them and returns `resumed`, and the INSERT that writes
     settings_json sits after that early return. So the shipping profile, image
     choices and byProduct captured on the FIRST press were baked in forever.
     Measured on job 050552ce: the seller corrected a shipping profile belonging
     to a previous Etsy shop, pressed publish, and the queue kept failing on the
     old id - "Could not find shipping_profile_id='59955810985' associated with
     shop '21777478'" - because the corrected value never reached the job. */
  await env.DB.prepare(`UPDATE etsy_publish_jobs SET settings_json=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND id IN (SELECT DISTINCT job_id FROM etsy_publish_items WHERE user_id=? AND product_id IN (${ids.map(()=>"?").join(",")}))`).bind(settingsJson,user.userId,user.userId,...ids).run();
  const existing=await env.DB.prepare(`SELECT job_id FROM etsy_publish_items WHERE user_id=? AND product_id IN (${ids.map(()=>"?").join(",")}) AND status IN ('queued','running') LIMIT 1`).bind(user.userId,...ids).first<{job_id:string}>();if(existing)return NextResponse.json({ok:true,resumed:true,job:await publishJobPayload(user.userId,existing.job_id)});
  const completed=await env.DB.prepare(`SELECT job_id,COUNT(*) count FROM etsy_publish_items WHERE user_id=? AND product_id IN (${ids.map(()=>"?").join(",")}) AND status='completed' GROUP BY job_id ORDER BY count DESC LIMIT 1`).bind(user.userId,...ids).first<{job_id:string;count:number}>();if(Number(completed?.count||0)===ids.length)return NextResponse.json({ok:true,resumed:true,job:await publishJobPayload(user.userId,completed!.job_id)});
  const [etsy,printify,planRow,monthUsed,dayUsed,pending]=await Promise.all([env.DB.prepare("SELECT shop_id FROM etsy_connections WHERE user_id=?").bind(user.userId).first(),env.DB.prepare("SELECT 1 ready FROM printify_connections WHERE user_id=?").bind(user.userId).first(),env.DB.prepare("SELECT plan_key FROM account_plans WHERE user_id=?").bind(user.userId).first<{plan_key:string}>(),env.DB.prepare("SELECT COUNT(*) count FROM etsy_listing_usage WHERE user_id=? AND substr(published_at,1,7)=?").bind(user.userId,monthKey()).first<{count:number}>(),env.DB.prepare("SELECT COUNT(*) count FROM etsy_listing_usage WHERE user_id=? AND published_at>=datetime('now','-24 hours')").bind(user.userId).first<{count:number}>(),env.DB.prepare("SELECT COUNT(*) count FROM etsy_publish_items WHERE user_id=? AND status IN ('queued','running')").bind(user.userId).first<{count:number}>()]);
  if(!etsy)return NextResponse.json({error:"Connect Etsy before publishing. Goldie will not publish listings it cannot finish safely."},{status:400});if(!printify)return NextResponse.json({error:"Reconnect Printify before publishing."},{status:401});
  /* D639 - the backstop. A batch built before the step-1 check existed, or one
     whose Etsy connection changed after the drafts were made, would otherwise
     publish into a shop Goldie cannot finish listings in. That is exactly what
     job 050552ce did: Printify accepted the publish for HOWDYANGEL and the
     listings were never going to appear in shesawolfclothing. Money is spent on
     the far side of this call, so it is worth one extra request. */
  const etsyName=await env.DB.prepare("SELECT shop_name FROM etsy_connections WHERE user_id=?").bind(user.userId).first<{shop_name:string}>();
  const printifyToken=await env.DB.prepare("SELECT encrypted_token FROM printify_connections WHERE user_id=?").bind(user.userId).first<{encrypted_token:string}>();
  const tokenKey=(env as unknown as {PRINTIFY_TOKEN_KEY?:string}).PRINTIFY_TOKEN_KEY;
  if(etsyName?.shop_name&&printifyToken?.encrypted_token&&tokenKey){
    const shopIdList:number[]=rows.results.map((row:{response_json:string})=>{try{return Number((JSON.parse(row.response_json) as {shopId?:number}).shopId)||0}catch{return 0}});
    const shopIds:number[]=[...new Set(shopIdList)].filter(value=>Number.isInteger(value)&&value>0);
    if(shopIds.length){
      const token=await decryptPrintifyToken(printifyToken.encrypted_token,tokenKey).catch(()=>"");
      if(token){
        const response=await fetch("https://api.printify.com/v1/shops.json",{headers:{Authorization:`Bearer ${token}`,"User-Agent":"Goldie-Listing-Factory"},cache:"no-store"}).catch(()=>null);
        const shops=response&&response.ok?(await response.json().catch(()=>[]) as Array<{id:number;title:string}>):[];
        const etsyLink=await etsyConnection(user.userId).catch(()=>null);
        if(etsyLink)for(const shopId of shopIds){
          const shop=shops.find(entry=>Number(entry.id)===shopId);
          const pairing=await verifyShopPairing({printifyToken:token,printifyShopId:shopId,etsyShopId:etsyLink.shopId,etsyToken:etsyLink.token,etsyFetch});
          if(pairing.result==="mismatched")return NextResponse.json(shopMismatch(shop?.title||"This Printify store",etsyLink.shopName||etsyName.shop_name),{status:409});
        }
      }
    }
  }
  const plan=planFor(planRow?.plan_key,isOwner(user)),reserved=Number(pending?.count||0),monthlyRemaining=plan.drafts-Number(monthUsed?.count||0)-reserved,dailyRemaining=plan.dailyListings-Number(dayUsed?.count||0)-reserved;
  if(ids.length>monthlyRemaining)return NextResponse.json({error:`This batch would exceed your ${plan.drafts}-listing monthly allowance. You can queue ${Math.max(0,monthlyRemaining)} more ${monthlyRemaining===1?"listing":"listings"} this month.`},{status:429});if(ids.length>dailyRemaining)return NextResponse.json({error:`Goldie can publish ${Math.max(0,dailyRemaining)} more ${dailyRemaining===1?"listing":"listings"} for this account within the current 24-hour window. Your monthly listings remain available.`},{status:429});
  const proposedJobId=crypto.randomUUID(),drafts=rows.results.map(row=>JSON.parse(row.response_json) as {id:string;batchId?:string}),batchId=drafts[0]?.batchId||proposedJobId,/* D697 - every draft already carries its own batchId and the job keeps only the first one, so a bundle credited all of its listings to whichever product happened to be first. Keep the whole map. */batchByProduct=Object.fromEntries(drafts.filter(draft=>draft.id).map(draft=>[String(draft.id),String(draft.batchId||batchId)])),/* D559 - one blob of settings per job meant one shipping profile and one set of
     image selections for every listing in it, so a bundle could not be published in
     a single call. Each product carries its own now. */
  settings=settingsJson;
  await env.DB.prepare("INSERT INTO etsy_publish_jobs (id,user_id,batch_id,status,total,settings_json) VALUES (?,?,?,'queued',?,?) ON CONFLICT(user_id,batch_id) DO UPDATE SET status='queued',settings_json=excluded.settings_json,total=MAX(etsy_publish_jobs.total,excluded.total),failed=0,last_error=NULL,updated_at=CURRENT_TIMESTAMP").bind(proposedJobId,user.userId,batchId,ids.length,settings).run();
  const canonical=await env.DB.prepare("SELECT id FROM etsy_publish_jobs WHERE user_id=? AND batch_id=?").bind(user.userId,batchId).first<{id:string}>(),jobId=canonical?.id||proposedJobId;
  await env.DB.batch(ids.map(productId=>env.DB.prepare("INSERT INTO etsy_publish_items (id,job_id,user_id,product_id,batch_id,status,available_at) VALUES (?,?,?,?,?,'queued',0) ON CONFLICT(user_id,product_id) DO UPDATE SET job_id=excluded.job_id,status=CASE WHEN etsy_publish_items.status='completed' THEN 'completed' ELSE 'queued' END,attempts=0,available_at=0,last_error=NULL,locked_at=NULL,updated_at=CURRENT_TIMESTAMP").bind(crypto.randomUUID(),jobId,user.userId,productId,batchByProduct[String(productId)]||batchId)));
  return NextResponse.json({ok:true,job:await publishJobPayload(user.userId,jobId)},{status:202});
}

export async function GET(request:Request){const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to view this publish job."},{status:401});const jobId=new URL(request.url).searchParams.get("jobId")||"";if(!jobId)return NextResponse.json({error:"A publish job is required."},{status:400});const current=await publishJobPayload(user.userId,jobId);if(!current)return NextResponse.json({error:"This publish job was not found."},{status:404});if(current.queued+current.processing>0)await drainGlobalPublishQueue();/* D480 - each poll advanced exactly one listing, and the browser waits for the reply before polling again, so the whole batch ran strictly one at a time. *//* D476 - was gated on the job's status string, which could say needs_attention while items sat queued underneath it, stalling the queue permanently. */return NextResponse.json({ok:true,job:await publishJobPayload(user.userId,jobId)})}
