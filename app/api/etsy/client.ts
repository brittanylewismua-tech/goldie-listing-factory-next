import {paceEtsyRequest,RESERVE_ETSY_SLOT_SQL,EtsyRateLimited} from './request-pacing';
import { env } from "cloudflare:workers";
import { decryptPrintifyToken, encryptPrintifyToken } from "../printify/token-crypto";

const API="https://api.etsy.com/v3/application";
type Runtime={DB:D1Database;ETSY_API_KEY?:string;ETSY_API_SECRET?:string;ETSY_TOKEN_KEY?:string;PRINTIFY_TOKEN_KEY?:string;ETSY_REDIRECT_URI?:string;GOLDIE_SITE_URL?:string;ETSY_QPD_LIMIT?:string};
const runtime=()=>env as unknown as Runtime;
const secret=()=>runtime().ETSY_TOKEN_KEY||runtime().PRINTIFY_TOKEN_KEY||"";
export const apiKey=()=>{const value=runtime().ETSY_API_KEY?.trim();if(!value)throw new Error("Etsy API access is not configured yet.");return value};
export const etsyRedirectUri=()=>{const value=runtime().ETSY_REDIRECT_URI?.trim();if(!value)throw new Error("ETSY_REDIRECT_URI is not configured.");return value};
export const goldieSiteUrl=()=>runtime().GOLDIE_SITE_URL?.trim().replace(/\/$/,"")||"https://thegoldiesuite.com";
export const etsyApiCredential=()=>{const secretValue=runtime().ETSY_API_SECRET?.trim();if(!secretValue)throw new Error("Etsy API access is not configured yet.");return `${apiKey()}:${secretValue}`};
const hourBucket=(date=new Date())=>date.toISOString().slice(0,13);
export const etsyQpdLimit=()=>Math.max(100,Number(runtime().ETSY_QPD_LIMIT)||5000);
export async function waitForEtsyCapacity(){
 await paceEtsyRequest({now:Date.now,
  read:async()=>{const row=await runtime().DB.prepare('SELECT p.qps_limit,q.paused_until FROM etsy_request_pacing p LEFT JOIN etsy_queue_state q ON q.id=p.id WHERE p.id=1').first<{qps_limit:number;paused_until:number}>();if(!row)throw Error('Etsy request scheduling is unavailable. Your saved work is safe.');return {qps:row.qps_limit,pausedUntil:Number(row.paused_until||0)*1000}},
  reserve:async(now,interval)=>{const row=await runtime().DB.prepare(RESERVE_ETSY_SLOT_SQL).bind(now,interval,now).first<{next_at_ms:number}>();return row?.next_at_ms??null},
  wait:ms=>new Promise(resolve=>setTimeout(resolve,ms))});
}
/**
 * WHAT SPENT THE QUOTA, NOT JUST HOW MUCH.
 *
 * Every call has always been counted. None of them said what they were for, so
 * the log could tell you nine thousand requests had gone and never which
 * feature took them — no way to know what to make cheaper, and nothing to send
 * Etsy, who want proof of need before they raise a limit. A number is a
 * complaint; a breakdown is a case.
 *
 * `feature` defaults to "unlabelled" so an unlabelled call still records
 * against the budget. Missing a label must never mean missing a call.
 */
export type EtsyFeature="publish"|"photos"|"search"|"taxonomy"|"shipping"|"connect"|"qa"|"unlabelled";

export async function recordEtsyCall(response:Response,feature:EtsyFeature="unlabelled"){
  const bucket=hourBucket(),observedLimit=Math.max(0,Number(response.headers.get("x-limit-per-day"))||0);
  const statements=[runtime().DB.prepare("INSERT INTO etsy_api_usage_buckets (bucket,feature,calls,rate_limited,qpd_limit,updated_at) VALUES (?,?,1,?,?,CURRENT_TIMESTAMP) ON CONFLICT(bucket,feature) DO UPDATE SET calls=calls+1,rate_limited=rate_limited+excluded.rate_limited,qpd_limit=CASE WHEN excluded.qpd_limit>0 THEN excluded.qpd_limit ELSE qpd_limit END,updated_at=CURRENT_TIMESTAMP").bind(bucket,feature,response.status===429?1:0,observedLimit)];
  /*
    WHAT ETSY SAYS IS LEFT, WHICH INCLUDES WHAT WE DID NOT SPEND.

    The quota belongs to the Etsy APP, not to this codebase, and World Builder
    runs on the same key. Counting only our own calls means the budget believes
    in headroom another product already used, and the first anybody would know
    is a seller's publish failing in the middle of a batch.

    Etsy states the truth on every response. It costs nothing to believe it.
  */
  const remaining=Number(response.headers.get("x-remaining-today"));
  if(Number.isSafeInteger(remaining)&&remaining>=0)
    statements.push(runtime().DB.prepare("INSERT INTO etsy_queue_state (id,remaining_today,remaining_at,updated_at) VALUES (1,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET remaining_today=excluded.remaining_today,remaining_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP").bind(remaining));
  const qps=Number(response.headers.get("x-limit-per-second"));
  if(Number.isSafeInteger(qps)&&qps>0)statements.push(runtime().DB.prepare('UPDATE etsy_request_pacing SET qps_limit=?,updated_at=? WHERE id=1').bind(qps,Date.now()));
  if(response.status===429){const retryAfter=Math.max(60,Math.min(1800,Number(response.headers.get("retry-after"))||300));statements.push(runtime().DB.prepare("INSERT INTO etsy_queue_state (id,paused_until,last_worker_status,last_error,updated_at) VALUES (1,?,'rate_limited','Etsy asked The Listing Factory to slow down.',CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET paused_until=MAX(paused_until,excluded.paused_until),last_worker_status=excluded.last_worker_status,last_error=excluded.last_error,updated_at=CURRENT_TIMESTAMP").bind(Math.floor(Date.now()/1000)+retryAfter))}
  await runtime().DB.batch(statements);
}
export async function etsyBudget(){
  const since=new Date(Date.now()-24*60*60*1000).toISOString().slice(0,13);
  const [row,observed,breakdown]=await Promise.all([runtime().DB.prepare("SELECT COALESCE(SUM(calls),0) calls,COALESCE(SUM(rate_limited),0) rate_limited FROM etsy_api_usage_buckets WHERE bucket>=?").bind(since).first<{calls:number;rate_limited:number}>(),runtime().DB.prepare("SELECT qpd_limit FROM etsy_api_usage_buckets WHERE qpd_limit>0 ORDER BY updated_at DESC LIMIT 1").first<{qpd_limit:number}>(),runtime().DB.prepare("SELECT feature,SUM(calls) calls FROM etsy_api_usage_buckets WHERE bucket>=? GROUP BY feature ORDER BY calls DESC").bind(since).all<{feature:string;calls:number}>()]);
  const limit=Number(observed?.qpd_limit)||etsyQpdLimit(),usable=Math.floor(limit*.8);
  /*
    Etsy's figure wins when it is fresh. Ours counts this app's calls; Etsy's
    counts the whole key, so on a morning World Builder has swept a hundred
    shops the two disagree and Etsy is the one that is right. Whichever number
    is worse wins, never the optimistic one. Stale after an hour — an
    over-cautious local count beats yesterday's figure used as though it were
    now.
  */
  const live=await runtime().DB.prepare("SELECT remaining_today FROM etsy_queue_state WHERE id=1 AND remaining_at>datetime('now','-1 hour')").first<{remaining_today:number}>();
  const reported=Number(live?.remaining_today);
  const reportedUsed=Number.isSafeInteger(reported)?Math.max(0,limit-reported):0;
  const used=Math.max(Number(row?.calls||0),reportedUsed);
  return {limit,usable,used,remaining:Math.max(0,usable-used),reserved:limit-usable,rateLimited:Number(row?.rate_limited||0),
    /* Ordered heaviest first — the first row is the thing to fix, and the whole
       list is what goes to Etsy when asking for more. */
    byFeature:((breakdown.results??[]) as Record<string,unknown>[]).map(r=>({feature:String(r.feature),calls:Number(r.calls)}))};
}

export async function encryptEtsy(value:string){return encryptPrintifyToken(value,secret())}
export async function decryptEtsy(value:string){return decryptPrintifyToken(value,secret())}

async function refresh(userId:string,refreshToken:string){
  const response=await fetch("https://api.etsy.com/v3/public/oauth/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"refresh_token",client_id:apiKey(),refresh_token:refreshToken}),signal:AbortSignal.timeout(20000)});
  const payload=await response.json() as {access_token?:string;refresh_token?:string;expires_in?:number;error_description?:string};
  if(!response.ok||!payload.access_token||!payload.refresh_token)throw new Error(payload.error_description||"Reconnect Etsy to continue.");
  await runtime().DB.prepare("UPDATE etsy_connections SET encrypted_access_token=?, encrypted_refresh_token=?, expires_at=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND is_active=1").bind(await encryptEtsy(payload.access_token),await encryptEtsy(payload.refresh_token),Math.floor(Date.now()/1000)+Number(payload.expires_in||3600),userId).run();
  return payload.access_token;
}

export async function etsyConnection(userId:string){
  const row=await runtime().DB.prepare(/* D835 · the seller may have several shops connected; this is the one they are working in. */
    "SELECT encrypted_access_token, encrypted_refresh_token, expires_at, etsy_user_id, shop_id, shop_name FROM etsy_connections WHERE user_id=? AND is_active=1").bind(userId).first<{encrypted_access_token:string;encrypted_refresh_token:string;expires_at:number;etsy_user_id:number;shop_id:number;shop_name:string}>();
  if(!row)throw new Error("Connect Etsy before publishing this batch.");
  let token=await decryptEtsy(row.encrypted_access_token);
  if(row.expires_at<Math.floor(Date.now()/1000)+120)token=await refresh(userId,await decryptEtsy(row.encrypted_refresh_token));
  return {token,shopId:row.shop_id,shopName:row.shop_name,etsyUserId:row.etsy_user_id};
}

export async function etsyFetch<T>(path:string,token:string,init?:RequestInit,meter?:{calls:number},feature:EtsyFeature="publish"):Promise<T>{
  for(let attempt=0;attempt<5;attempt+=1){
    await waitForEtsyCapacity();
    const response=await fetch(`${API}${path}`,{...init,signal:init?.signal??AbortSignal.timeout(30000),headers:{"x-api-key":etsyApiCredential(),Authorization:`Bearer ${token}`,...(init?.body instanceof URLSearchParams?{"Content-Type":"application/x-www-form-urlencoded"}:{}),...(init?.headers||{})}});
    if(meter)meter.calls+=1;
    await recordEtsyCall(response,feature);
    if(response.status===429)throw new EtsyRateLimited('Etsy asked The Listing Factory to slow down. Your saved work will continue automatically.');
    const text=await response.text();let payload:unknown={};try{payload=text?JSON.parse(text):{}}catch{payload={error:text}}
    if(response.ok)return payload as T;
    if((response.status===429||response.status>=500)&&attempt<4){
      const retryAfter=Number(response.headers.get("retry-after"));
      const wait=Number.isFinite(retryAfter)&&retryAfter>0?Math.min(retryAfter*1000,8000):Math.min(750*2**attempt,6000);
      await new Promise(resolve=>setTimeout(resolve,wait));
      continue;
    }
    const detail=typeof payload==="object"&&payload&&"error" in payload?String((payload as {error:unknown}).error):`Etsy returned ${response.status}.`;
    if(response.status===429)throw new Error("Etsy is temporarily busy. Your changes are still in the form. Wait a moment, then click Save new shipping profile again.");
    throw new Error(detail);
  }
  throw new Error("Etsy is temporarily busy. Your changes are still in the form. Wait a moment, then try again.");
}
