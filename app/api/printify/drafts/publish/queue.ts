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
/* D637 - a claim is a heartbeat: an execution that dies leaves locked_at behind,
   and after this it is safe to assume nobody is working on it. Short, because
   every pass is now short. */
const RECLAIM_SECONDS=120;
/* Printify creates the Etsy listing asynchronously. Rather than block a whole
   execution waiting for it, each pass polls briefly and hands the item back to
   the queue - so an interruption costs one short pass, not the listing. */
const LISTING_ID_POLLS=3;
const LISTING_ID_GAP_MS=2000;
const MAX_LISTING_WAITS=20;
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
/* D637 - this polled 18 times at 2.5s, so a single item could hold an execution
   for 45 seconds plus the publish call. Cloudflare ends the request long before
   that, and because the item was already marked running with no sweep on the
   path the browser polls, it stayed running forever: 0 completed, 0 failed, no
   error, for as long as anyone cared to watch. Measured on job 050552ce.
   A short look now; if the id is not there yet the item goes back on the queue
   and the next pass - browser poll or the one-minute cron - looks again. */
async function pollForEtsyListing(token:string,shopId:number,productId:string){for(let attempt=0;attempt<LISTING_ID_POLLS;attempt++){if(attempt)await new Promise(resolve=>setTimeout(resolve,LISTING_ID_GAP_MS));const id=await printifyListingId(token,shopId,productId);if(id>0)return id}return 0}

/* D637 - the sweep that returns an abandoned claim to the queue. It used to run
   only inside processNextPublishItem, which is reached only when a QUEUED row
   exists for that job. Both items running meant no queued row, so the sweep was
   never reached and nothing could ever recover it. It runs on every path now. */
export async function reclaimStalledPublishItems(){
  const now=Math.floor(Date.now()/1000);
  const swept=await runtime().DB.prepare("UPDATE etsy_publish_items SET status='queued',locked_at=NULL,available_at=?,updated_at=CURRENT_TIMESTAMP WHERE status='running' AND (locked_at IS NULL OR locked_at<?)").bind(now,now-RECLAIM_SECONDS).run();
  return Number(swept.meta.changes||0);
}
async function refreshJob(jobId:string){const totals=await runtime().DB.prepare("SELECT SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed,SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failed,SUM(CASE WHEN status IN ('queued','running') THEN 1 ELSE 0 END) pending FROM etsy_publish_items WHERE job_id=?").bind(jobId).first<{completed:number;failed:number;pending:number}>();const completed=Number(totals?.completed||0),failed=Number(totals?.failed||0),pending=Number(totals?.pending||0),status=pending?"processing":failed?"needs_attention":"completed";await runtime().DB.prepare("UPDATE etsy_publish_jobs SET status=?,completed=?,failed=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,completed,failed,jobId).run()}

export async function processNextPublishItem(userId:string,jobId:string){
  const now=Math.floor(Date.now()/1000);await reclaimStalledPublishItems();
  const capacity=await queueCapacity(now),budget=capacity.budget;
  if(!capacity.canStart)return {waitingForQuota:true,processed:false,budget,paused:capacity.paused};
  /* D637 - this took the single oldest queued row, so the four parallel slots in
     drainGlobalPublishQueue all picked the SAME row; one won the claim and the
     other three returned without trying anything else. Two listings could not
     progress independently. Each slot walks the candidates until it claims one
     nobody else has. */
  const candidates=await runtime().DB.prepare("SELECT id,product_id,attempts FROM etsy_publish_items WHERE job_id=? AND user_id=? AND status='queued' AND available_at<=? ORDER BY created_at,id LIMIT ?").bind(jobId,userId,now,MAX_CONCURRENT_LISTINGS).all<{id:string;product_id:string;attempts:number}>();
  let item:{id:string;product_id:string;attempts:number}|null=null;
  for(const candidate of candidates.results||[]){
    const claimed=await runtime().DB.prepare("UPDATE etsy_publish_items SET status='running',locked_at=?,attempts=attempts+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='queued'").bind(now,candidate.id).run();
    if(claimed.meta.changes){item=candidate;break}
  }
  if(!item){await refreshJob(jobId);return {waiting:false,processed:false,budget}}
  try{
    const job=await runtime().DB.prepare("SELECT settings_json FROM etsy_publish_jobs WHERE id=? AND user_id=?").bind(jobId,userId).first<{settings_json:string}>(),row=await runtime().DB.prepare("SELECT response_json FROM printify_draft_results WHERE user_id=? AND status='succeeded' AND json_extract(response_json,'$.id')=? LIMIT 1").bind(userId,item.product_id).first<{response_json:string}>();if(!job||!row)throw new Error("Goldie could not reload this listing safely.");
    const settings=JSON.parse(job.settings_json) as Settings,draft=JSON.parse(row.response_json) as Draft,connection=await runtime().DB.prepare("SELECT encrypted_token FROM printify_connections WHERE user_id=?").bind(userId).first<{encrypted_token:string}>(),secret=runtime().PRINTIFY_TOKEN_KEY;if(!connection||!secret)throw new Error("Reconnect Printify so Goldie can continue this queued batch.");const token=await decryptPrintifyToken(connection.encrypted_token,secret);
    /* D637 · Idempotency, checked in this order before publish is ever called
       again: Goldie's own link record first, then Printify's external Etsy id.
       Either one means the listing exists and must not be created a second
       time - which is what makes retrying an interrupted item safe. */
    const linked=await runtime().DB.prepare("SELECT etsy_listing_id FROM etsy_listing_links WHERE printify_product_id=? AND user_id=? AND etsy_listing_id>0").bind(draft.id,userId).first<{etsy_listing_id:number}>();
    let listingId=Number(linked?.etsy_listing_id)||await printifyListingId(token,draft.shopId,draft.id);
    /* D638 - D637's idempotency rested entirely on Printify eventually setting
       external.id. Watching job 050552ce recover, it never did: each pass found
       no id, called publish.json AGAIN, polled, and requeued - so the "no
       duplicate publication" guarantee held only in the case where the id came
       back. Goldie has to remember that IT published, independently of whether
       Printify has told it anything yet. The link row is written the moment the
       publish is accepted, with id 0 meaning "published, awaiting the id". */
    const priorAttempt=listingId?null:await runtime().DB.prepare("SELECT status FROM etsy_listing_links WHERE printify_product_id=? AND user_id=?").bind(draft.id,userId).first<{status:string}>();
    let alreadyPublished=Boolean(priorAttempt&&priorAttempt.status==="publishing");
    /* D642 · D638 made Goldie remember that it published, so a resumed item never
       publishes twice. That is right while a publish is in flight and wrong once
       it has definitively failed: Printify can accept a publish and then error on
       its own side - "Sorry, we couldn't publish this product" - leaving no Etsy
       listing and no external id, forever. Goldie went on believing it had
       published and would only ever poll, so the seller could never retry. Both
       Hoodie products sat in exactly that state.
       A deliberate retry is distinguishable: D475 resets attempts to 0 when the
       seller presses publish on a FAILED item, and the queue's own polling never
       does. So on the first pass of a retry, with Printify still showing no
       listing, the remembered publish plainly did not take effect - clear it and
       allow exactly one fresh publish. Every later pass in the same run still
       refuses, so this can never become a loop of publish calls. */
    if(alreadyPublished&&!listingId&&item.attempts===0){
      await runtime().DB.prepare("UPDATE etsy_listing_links SET status='retrying',last_error=?,updated_at=CURRENT_TIMESTAMP WHERE printify_product_id=? AND user_id=? AND etsy_listing_id=0")
        .bind("Printify accepted a publish that produced no Etsy listing; the seller retried and Goldie published once more.",draft.id,userId).run();
      alreadyPublished=false;
    }
    if(!listingId&&!alreadyPublished){
      const response=await fetch(`https://api.printify.com/v1/shops/${draft.shopId}/products/${draft.id}/publish.json`,{method:"POST",headers:{...printifyHeaders(token),"Content-Type":"application/json"},body:JSON.stringify({title:true,description:true,images:true,variants:true,tags:true,keyFeatures:true,shipping_template:true})});
      if(!response.ok)throw new Error(`Printify could not publish this listing (${response.status}).`);
      await runtime().DB.prepare("INSERT INTO etsy_listing_links (printify_product_id,user_id,batch_id,etsy_listing_id,status,last_error,updated_at) VALUES (?,?,?,0,'publishing',NULL,CURRENT_TIMESTAMP) ON CONFLICT(printify_product_id) DO UPDATE SET status='publishing',last_error=NULL,updated_at=CURRENT_TIMESTAMP").bind(draft.id,userId,draft.batchId||"").run();
    }
    if(!listingId)listingId=await pollForEtsyListing(token,draft.shopId,draft.id);
    if(!listingId){
      /* Printify has the publish; the Etsy id is not back yet. Hand the item to
         the queue rather than hold an execution open waiting for it. Every pass
         re-enters above, sees `published` via Printify's external id, and never
         publishes twice. Bounded: after MAX_LISTING_WAITS it fails and says so
         rather than waiting forever. */
      const waits=item.attempts+1;
      if(waits>=MAX_LISTING_WAITS)throw new Error("Printify accepted the publish but never returned an Etsy listing ID. Goldie published once and did not repeat it - open this product in Printify and check that it is connected to your Etsy shop.");
      await runtime().DB.prepare("UPDATE etsy_publish_items SET status='queued',locked_at=NULL,available_at=?,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(Math.floor(Date.now()/1000)+15,`Waiting for Printify to return the Etsy listing ID (check ${waits} of ${MAX_LISTING_WAITS}).`,item.id).run();
      await refreshJob(jobId);
      return {waiting:true,processed:true,budget:await etsyBudget()};
    }
    await runtime().DB.prepare("INSERT INTO etsy_listing_links (printify_product_id,user_id,batch_id,etsy_listing_id,status,last_error,updated_at) VALUES (?,?,?,?, 'finishing',NULL,CURRENT_TIMESTAMP) ON CONFLICT(printify_product_id) DO UPDATE SET etsy_listing_id=excluded.etsy_listing_id,status='finishing',last_error=NULL,updated_at=CURRENT_TIMESTAMP").bind(draft.id,userId,draft.batchId||"",listingId).run();
    /* D637 - refresh the claim before the finishing stage, so a long finish is
       not mistaken for an abandoned one and swept out from under itself. */
    await runtime().DB.prepare("UPDATE etsy_publish_items SET locked_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(Math.floor(Date.now()/1000),item.id).run();
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
  /* D637 - the browser polls the job GET, which drains the GLOBAL queue. That
     path never swept, and it only looks for queued rows, so once both items
     were running nothing on earth could recover them. */
  await reclaimStalledPublishItems();
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

export async function publishJobPayload(userId:string,jobId:string){const job=await runtime().DB.prepare("SELECT id,status,total,completed,failed,last_error,created_at,updated_at FROM etsy_publish_jobs WHERE id=? AND user_id=?").bind(jobId,userId).first<{id:string;status:string;total:number;completed:number;failed:number;last_error?:string;created_at:string;updated_at:string}>();if(!job)return null;const rows=await runtime().DB.prepare("SELECT product_id,status,result_json,last_error,available_at FROM etsy_publish_items WHERE job_id=? AND user_id=? ORDER BY created_at,id").bind(jobId,userId).all<{product_id:string;status:string;result_json?:string;last_error?:string;available_at:number}>(),finished=rows.results.flatMap(row=>row.result_json?[JSON.parse(row.result_json)]:[]),nextRetry=Math.min(...rows.results.filter(row=>row.status==="queued"&&row.available_at>0).map(row=>row.available_at),Infinity);const failures=rows.results.filter(row=>row.status==="failed").map(row=>({productId:row.product_id,error:row.last_error||"Goldie could not finish this listing."}));/* D638 - the payload reported only counts, so an item patiently waiting for
     Printify looked exactly like an item doing nothing: 0 completed, 0 failed,
     no error, forever. The per-item note is the difference between "stuck" and
     "waiting", and it is what took eleven minutes to work out by hand. */
  const items=rows.results.map((row:{product_id:string;status:string;last_error?:string;available_at:number})=>({productId:row.product_id,status:row.status,note:row.last_error||null,availableAt:row.available_at||null}));
  return {...job,items,finished,failures,queued:rows.results.filter(row=>row.status==="queued").length,processing:rows.results.filter(row=>row.status==="running").length,nextRetry:Number.isFinite(nextRetry)?nextRetry:null,budget:await etsyBudget()}}
