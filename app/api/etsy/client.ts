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
export async function recordEtsyCall(response:Response){
  const bucket=hourBucket(),observedLimit=Math.max(0,Number(response.headers.get("x-limit-per-day"))||0);
  const statements=[runtime().DB.prepare("INSERT INTO etsy_api_usage_buckets (bucket,calls,rate_limited,qpd_limit,updated_at) VALUES (?,1,?,?,CURRENT_TIMESTAMP) ON CONFLICT(bucket) DO UPDATE SET calls=calls+1,rate_limited=rate_limited+excluded.rate_limited,qpd_limit=CASE WHEN excluded.qpd_limit>0 THEN excluded.qpd_limit ELSE qpd_limit END,updated_at=CURRENT_TIMESTAMP").bind(bucket,response.status===429?1:0,observedLimit)];
  if(response.status===429){const retryAfter=Math.max(60,Math.min(1800,Number(response.headers.get("retry-after"))||300));statements.push(runtime().DB.prepare("INSERT INTO etsy_queue_state (id,paused_until,last_worker_status,last_error,updated_at) VALUES (1,?,'rate_limited','Etsy asked Goldie to slow down.',CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET paused_until=MAX(paused_until,excluded.paused_until),last_worker_status=excluded.last_worker_status,last_error=excluded.last_error,updated_at=CURRENT_TIMESTAMP").bind(Math.floor(Date.now()/1000)+retryAfter))}
  await runtime().DB.batch(statements);
}
export async function etsyBudget(){
  const since=new Date(Date.now()-24*60*60*1000).toISOString().slice(0,13);
  const [row,observed]=await Promise.all([runtime().DB.prepare("SELECT COALESCE(SUM(calls),0) calls,COALESCE(SUM(rate_limited),0) rate_limited FROM etsy_api_usage_buckets WHERE bucket>=?").bind(since).first<{calls:number;rate_limited:number}>(),runtime().DB.prepare("SELECT qpd_limit FROM etsy_api_usage_buckets WHERE qpd_limit>0 ORDER BY updated_at DESC LIMIT 1").first<{qpd_limit:number}>()]);
  const limit=Number(observed?.qpd_limit)||etsyQpdLimit(),usable=Math.floor(limit*.8),used=Number(row?.calls||0);
  return {limit,usable,used,remaining:Math.max(0,usable-used),reserved:limit-usable,rateLimited:Number(row?.rate_limited||0)};
}

export async function encryptEtsy(value:string){return encryptPrintifyToken(value,secret())}
export async function decryptEtsy(value:string){return decryptPrintifyToken(value,secret())}

async function refresh(userId:string,refreshToken:string){
  const response=await fetch("https://api.etsy.com/v3/public/oauth/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"refresh_token",client_id:apiKey(),refresh_token:refreshToken})});
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

export async function etsyFetch<T>(path:string,token:string,init?:RequestInit,meter?:{calls:number}):Promise<T>{
  for(let attempt=0;attempt<5;attempt+=1){
    const response=await fetch(`${API}${path}`,{...init,headers:{"x-api-key":etsyApiCredential(),Authorization:`Bearer ${token}`,...(init?.body instanceof URLSearchParams?{"Content-Type":"application/x-www-form-urlencoded"}:{}),...(init?.headers||{})}});
    if(meter)meter.calls+=1;
    await recordEtsyCall(response);
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
