import { env } from "cloudflare:workers";
import { decryptPrintifyToken } from "../../token-crypto";
import { etsyBudget } from "../../../etsy/client";
import { finishEtsyListing } from "../../../etsy/finish";
import { logError } from "@/app/error-log";

/* D559 - a job carried ONE settings blob: one shipping profile, one set of image
   selections. A bundle's products each have their own - her hoodie ships on the
   "Hoodies" profile and her tee on "Standard" - so the client could never send
   more than one product's listings in a single call. That is the whole reason
   publishing walked product by product, reopening each batch to read its
   settings, and the whole reason the publish review could only ever show and
   select the open product's listings. Settings are per product now; the flat
   fields stay as the fallback so jobs queued before this still drain. */
type ProductSettings={indices?:number[];selections?:number[];shippingProfileId?:number};
type Settings={printifyImageIndices:number[];printifyImageSelections:Record<string,number[]>;etsyShippingProfileId:number;byProduct?:Record<string,ProductSettings>};
type Draft={id:string;batchId?:string;shopId:number;title?:string;tags?:string[];description?:string;etsyDetails?:unknown};
type Runtime={DB:D1Database;PRINTIFY_TOKEN_KEY?:string};
const runtime=()=>env as unknown as Runtime;
const MAX_CONCURRENT_LISTINGS=4;
const printifyHeaders=(token:string)=>({Authorization:`Bearer ${token}`,"User-Agent":"Goldie-Listing-Factory"});

async function queueCapacity(now:number){
  const [state,average,running,budget]=await Promise.all([
    runtime().DB.prepare("SELECT paused_until,manually_paused FROM etsy_queue_state WHERE id=1").first<{paused_until:number;manually_paused:number}>(),
    runtime().DB.prepare("SELECT AVG(api_calls) average FROM (SELECT api_calls FROM etsy_listing_usage WHERE api_calls>0 ORDER BY published_at DESC LIMIT 200)").first<{average:number}>(),
    runtime().DB.prepare("SELECT COUNT(*) count FROM etsy_publish_items WHERE status='running' AND locked_at>=?").bind(now-300).first<{count:number}>(),
    etsyBudget(),
  ]);
  const estimatedCalls=Math.max(25,Math.min(100,Math.ceil(Number(average?.average||20)*1.25))),active=Number(running?.count||0),paused=Boolean(state?.manually_paused)||Number(state?.paused_until||0)>now;
  return {budget,estimatedCalls,active,paused,canStart:!paused&&active<MAX_CONCURRENT_LISTINGS&&budget.remaining-active*estimatedCalls>=estimatedCalls};
}

async function printifyListingId(token:string,shopId:number,productId:string){const response=await fetch(`https://api.printify.com/v1/shops/${shopId}/products/${productId}.json`,{headers:printifyHeaders(token)});if(!response.ok)return 0;const product=await response.json() as {external?:{id?:string}};return Number(product.external?.id)||0}
async function waitForEtsyListing(token:string,shopId:number,productId:string){for(let attempt=0;attempt<18;attempt++){if(attempt)await new Promise(resolve=>setTimeout(resolve,2500));const id=await printifyListingId(token,shopId,productId);if(id>0)return id}throw new Error("Printify published the product, but has not returned its Etsy listing ID yet. Goldie will retry this listing safely.")}
async function refreshJob(jobId:string){const totals=await runtime().DB.prepare("SELECT SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed,SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failed,SUM(CASE WHEN status IN ('queued','running') THEN 1 ELSE 0 END) pending FROM etsy_publish_items WHERE job_id=?").bind(jobId).first<{completed:number;failed:number;pending:number}>();const completed=Number(totals?.completed||0),failed=Number(totals?.failed||0),pending=Number(totals?.pending||0),status=pending?"processing":failed?"needs_attention":"completed";await runtime().DB.prepare("UPDATE etsy_publish_jobs SET status=?,completed=?,failed=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,completed,failed,jobId).run()}

export async function processNextPublishItem(userId:string,jobId:string){
  const now=Math.floor(Date.now()/1000);await runtime().DB.prepare("UPDATE etsy_publish_items SET status='queued',locked_at=NULL,available_at=?,updated_at=CURRENT_TIMESTAMP WHERE status='running' AND locked_at<?").bind(now,now-300).run();
  const capacity=await queueCapacity(now),budget=capacity.budget;
  if(!capacity.canStart)return {waitingForQuota:true,processed:false,budget,paused:capacity.paused};
  const item=await runtime().DB.prepare("SELECT id,product_id,attempts FROM etsy_publish_items WHERE job_id=? AND user_id=? AND status='queued' AND available_at<=? ORDER BY created_at,id LIMIT 1").bind(jobId,userId,now).first<{id:string;product_id:string;attempts:number}>();
  if(!item){await refreshJob(jobId);return {waiting:false,processed:false,budget}}const claimed=await runtime().DB.prepare("UPDATE etsy_publish_items SET status='running',locked_at=?,attempts=attempts+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='queued'").bind(now,item.id).run();if(!claimed.meta.changes)return {waiting:false,processed:false,budget};
  try{
    const job=await runtime().DB.prepare("SELECT settings_json FROM etsy_publish_jobs WHERE id=? AND user_id=?").bind(jobId,userId).first<{settings_json:string}>(),row=await runtime().DB.prepare("SELECT response_json FROM printify_draft_results WHERE user_id=? AND status='succeeded' AND json_extract(response_json,'$.id')=? LIMIT 1").bind(userId,item.product_id).first<{response_json:string}>();if(!job||!row)throw new Error("Goldie could not reload this listing safely.");
    const settings=JSON.parse(job.settings_json) as Settings,draft=JSON.parse(row.response_json) as Draft,connection=await runtime().DB.prepare("SELECT encrypted_token FROM printify_connections WHERE user_id=?").bind(userId).first<{encrypted_token:string}>(),secret=runtime().PRINTIFY_TOKEN_KEY;if(!connection||!secret)throw new Error("Reconnect Printify so Goldie can continue this queued batch.");const token=await decryptPrintifyToken(connection.encrypted_token,secret);
    const linked=await runtime().DB.prepare("SELECT etsy_listing_id FROM etsy_listing_links WHERE printify_product_id=? AND user_id=? AND etsy_listing_id>0").bind(draft.id,userId).first<{etsy_listing_id:number}>();let listingId=Number(linked?.etsy_listing_id)||await printifyListingId(token,draft.shopId,draft.id);
    if(!listingId){const response=await fetch(`https://api.printify.com/v1/shops/${draft.shopId}/products/${draft.id}/publish.json`,{method:"POST",headers:{...printifyHeaders(token),"Content-Type":"application/json"},body:JSON.stringify({title:true,description:true,images:true,variants:true,tags:true,keyFeatures:true,shipping_template:true})});if(!response.ok)throw new Error(`Printify could not publish this listing (${response.status}).`);listingId=await waitForEtsyListing(token,draft.shopId,draft.id)}
    await runtime().DB.prepare("INSERT INTO etsy_listing_links (printify_product_id,user_id,batch_id,etsy_listing_id,status,last_error,updated_at) VALUES (?,?,?,?, 'finishing',NULL,CURRENT_TIMESTAMP) ON CONFLICT(printify_product_id) DO UPDATE SET etsy_listing_id=excluded.etsy_listing_id,status='finishing',last_error=NULL,updated_at=CURRENT_TIMESTAMP").bind(draft.id,userId,draft.batchId||"",listingId).run();
    const forProduct=settings.byProduct?.[draft.id]||{};
    const clean=(list?:number[])=>Array.isArray(list)?[...new Set(list.map(Number).filter(value=>Number.isInteger(value)&&value>=0))]:null;
    /* D626 - forProduct.indices was sent by the client and stored by the route
       but never read here, so the fallback landed on settings.printifyImageIndices:
       the photo choice of whichever product happened to be open when Publish was
       pressed. A bundle member relying on its own batch default got another
       product's photos. Its own default now sits ahead of the shared one, which
       stays last so jobs queued before D559 still drain. */
    const selection=clean(forProduct.selections)||clean(settings.printifyImageSelections[draft.id])||clean(forProduct.indices)||settings.printifyImageIndices;
    const shippingProfileId=Number(forProduct.shippingProfileId)||settings.etsyShippingProfileId;
    const result=await finishEtsyListing(userId,{...draft,etsyShippingProfileId:shippingProfileId,etsyDetails:draft.etsyDetails as {category?:string;attributes?:Record<string,string>;optional?:Record<string,string>}},listingId,selection),apiCalls=result.apiCalls,resultJson=JSON.stringify({printifyProductId:draft.id,etsyListingId:listingId,url:result.url});
    await runtime().DB.batch([runtime().DB.prepare("UPDATE etsy_publish_items SET status='completed',result_json=?,last_error=NULL,locked_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(resultJson,item.id),runtime().DB.prepare("INSERT INTO etsy_listing_usage (user_product,user_id,product_id,job_id,etsy_listing_id,api_calls,published_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_product) DO UPDATE SET job_id=excluded.job_id,etsy_listing_id=excluded.etsy_listing_id,api_calls=excluded.api_calls").bind(`${userId}:${draft.id}`,userId,draft.id,jobId,listingId,apiCalls)]);
  }catch(error){const message=error instanceof Error?error.message:"Goldie could not finish this listing.",attempt=item.attempts+1,retryable=attempt<5&&!/different shop|missing|required listing field|Choose an Etsy shipping profile/i.test(message),delay=Math.min(900,30*2**Math.max(0,attempt-1));await runtime().DB.prepare("UPDATE etsy_publish_items SET status=?,available_at=?,last_error=?,locked_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(retryable?"queued":"failed",retryable?now+delay:0,message,item.id).run();if(!retryable)await runtime().DB.prepare("UPDATE etsy_publish_jobs SET last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(message,jobId).run();
    /* D475 - publishing is the one step that costs money and the one step that
       had no logging at all. A batch failed twice in a row and there was
       nothing anywhere to say why - not in the error log, not on the page.
       Every failed listing now records the exact upstream message. */
    await logError({area:"etsy-publish",message,userId,severity:retryable?"warning":"error",
      context:{jobId,itemId:item.id,printifyProductId:item.product_id,attempt,willRetry:retryable,retryInSeconds:retryable?delay:null}}).catch(()=>null)}
  await refreshJob(jobId);return {waiting:false,processed:true,budget:await etsyBudget()};
}

export async function processNextGlobalPublishItem(){
  const now=Math.floor(Date.now()/1000),next=await runtime().DB.prepare("SELECT user_id,job_id FROM etsy_publish_items WHERE status='queued' AND available_at<=? ORDER BY created_at,id LIMIT 1").bind(now).first<{user_id:string;job_id:string}>();
  return next?processNextPublishItem(next.user_id,next.job_id):{waiting:false,processed:false,budget:await etsyBudget()};
}

export async function drainGlobalPublishQueue(maxItems=MAX_CONCURRENT_LISTINGS){
  const runId=crypto.randomUUID();await runtime().DB.prepare("INSERT INTO etsy_worker_runs (id,status) VALUES (?,'running')").bind(runId).run();
  try{
    /* D480 - this drained the queue one listing at a time, waiting for each to
       finish before starting the next. Almost all of that wait is idle: up to
       45 seconds per listing spent polling Printify for the Etsy listing id it
       has not created yet. So four listings took four minutes of mostly
       sleeping, and twenty took twenty. The work is entirely I/O, so the slots
       run together now - the cap and the Etsy budget check are unchanged, they
       are just used properly. */
    const limit=Math.max(1,Math.min(MAX_CONCURRENT_LISTINGS,maxItems));
    const results=await Promise.all(Array.from({length:limit},()=>processNextGlobalPublishItem().catch(()=>({processed:false}))));
    const processed=results.filter(result=>result.processed).length;
    await runtime().DB.batch([runtime().DB.prepare("UPDATE etsy_worker_runs SET status='completed',processed=?,finished_at=CURRENT_TIMESTAMP WHERE id=?").bind(processed,runId),runtime().DB.prepare("INSERT INTO etsy_queue_state (id,last_worker_at,last_worker_status,last_worker_processed,last_error,updated_at) VALUES (1,CURRENT_TIMESTAMP,'healthy',?,NULL,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET last_worker_at=CURRENT_TIMESTAMP,last_worker_status='healthy',last_worker_processed=excluded.last_worker_processed,last_error=NULL,updated_at=CURRENT_TIMESTAMP").bind(processed),runtime().DB.prepare("DELETE FROM etsy_api_usage_buckets WHERE bucket<strftime('%Y-%m-%dT%H','now','-45 days')"),runtime().DB.prepare("DELETE FROM etsy_worker_runs WHERE started_at<datetime('now','-30 days')")]);
    return {processed};
  }catch(error){const message=error instanceof Error?error.message:"The Etsy worker stopped unexpectedly.";await runtime().DB.batch([runtime().DB.prepare("UPDATE etsy_worker_runs SET status='failed',error=?,finished_at=CURRENT_TIMESTAMP WHERE id=?").bind(message,runId),runtime().DB.prepare("INSERT INTO etsy_queue_state (id,last_worker_at,last_worker_status,last_error,updated_at) VALUES (1,CURRENT_TIMESTAMP,'failed',?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET last_worker_at=CURRENT_TIMESTAMP,last_worker_status='failed',last_error=excluded.last_error,updated_at=CURRENT_TIMESTAMP").bind(message)]);throw error}
}

export async function kickGlobalPublishQueueIfDue(){
  const claim=await runtime().DB.prepare("UPDATE etsy_queue_state SET last_worker_status='running',updated_at=CURRENT_TIMESTAMP WHERE id=1 AND manually_paused=0 AND paused_until<=unixepoch() AND (last_worker_status!='running' OR updated_at<datetime('now','-5 minutes')) AND (last_worker_at IS NULL OR last_worker_at<datetime('now','-50 seconds'))").run();
  if(!claim.meta.changes)return {started:false};
  await drainGlobalPublishQueue();
  return {started:true};
}

export async function publishJobPayload(userId:string,jobId:string){const job=await runtime().DB.prepare("SELECT id,status,total,completed,failed,last_error,created_at,updated_at FROM etsy_publish_jobs WHERE id=? AND user_id=?").bind(jobId,userId).first<{id:string;status:string;total:number;completed:number;failed:number;last_error?:string;created_at:string;updated_at:string}>();if(!job)return null;const rows=await runtime().DB.prepare("SELECT product_id,status,result_json,last_error,available_at FROM etsy_publish_items WHERE job_id=? AND user_id=? ORDER BY created_at,id").bind(jobId,userId).all<{product_id:string;status:string;result_json?:string;last_error?:string;available_at:number}>(),finished=rows.results.flatMap(row=>row.result_json?[JSON.parse(row.result_json)]:[]),nextRetry=Math.min(...rows.results.filter(row=>row.status==="queued"&&row.available_at>0).map(row=>row.available_at),Infinity);const failures=rows.results.filter(row=>row.status==="failed").map(row=>({productId:row.product_id,error:row.last_error||"Goldie could not finish this listing."}));return {...job,finished,failures,queued:rows.results.filter(row=>row.status==="queued").length,processing:rows.results.filter(row=>row.status==="running").length,nextRetry:Number.isFinite(nextRetry)?nextRetry:null,budget:await etsyBudget()}}
