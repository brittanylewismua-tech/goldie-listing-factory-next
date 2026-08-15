import { env } from "cloudflare:workers";
import { decryptPrintifyToken, encryptPrintifyToken } from "../printify/token-crypto";

const API="https://api.etsy.com/v3/application";
type Runtime={DB:D1Database;ETSY_API_KEY?:string;ETSY_API_SECRET?:string;ETSY_TOKEN_KEY?:string;PRINTIFY_TOKEN_KEY?:string};
const runtime=()=>env as unknown as Runtime;
const secret=()=>runtime().ETSY_TOKEN_KEY||runtime().PRINTIFY_TOKEN_KEY||"";
export const apiKey=()=>{const value=runtime().ETSY_API_KEY?.trim();if(!value)throw new Error("Etsy API access is not configured yet.");return value};
const apiCredential=()=>{const secretValue=runtime().ETSY_API_SECRET?.trim();if(!secretValue)throw new Error("Etsy API access is not configured yet.");return `${apiKey()}:${secretValue}`};

export async function encryptEtsy(value:string){return encryptPrintifyToken(value,secret())}
export async function decryptEtsy(value:string){return decryptPrintifyToken(value,secret())}

async function refresh(userId:string,refreshToken:string){
  const response=await fetch("https://api.etsy.com/v3/public/oauth/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"refresh_token",client_id:apiKey(),refresh_token:refreshToken})});
  const payload=await response.json() as {access_token?:string;refresh_token?:string;expires_in?:number;error_description?:string};
  if(!response.ok||!payload.access_token||!payload.refresh_token)throw new Error(payload.error_description||"Reconnect Etsy to continue.");
  await runtime().DB.prepare("UPDATE etsy_connections SET encrypted_access_token=?, encrypted_refresh_token=?, expires_at=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?").bind(await encryptEtsy(payload.access_token),await encryptEtsy(payload.refresh_token),Math.floor(Date.now()/1000)+Number(payload.expires_in||3600),userId).run();
  return payload.access_token;
}

export async function etsyConnection(userId:string){
  const row=await runtime().DB.prepare("SELECT encrypted_access_token, encrypted_refresh_token, expires_at, etsy_user_id, shop_id, shop_name FROM etsy_connections WHERE user_id=?").bind(userId).first<{encrypted_access_token:string;encrypted_refresh_token:string;expires_at:number;etsy_user_id:number;shop_id:number;shop_name:string}>();
  if(!row)throw new Error("Connect Etsy before publishing this batch.");
  let token=await decryptEtsy(row.encrypted_access_token);
  if(row.expires_at<Math.floor(Date.now()/1000)+120)token=await refresh(userId,await decryptEtsy(row.encrypted_refresh_token));
  return {token,shopId:row.shop_id,shopName:row.shop_name,etsyUserId:row.etsy_user_id};
}

export async function etsyFetch<T>(path:string,token:string,init?:RequestInit):Promise<T>{
  const response=await fetch(`${API}${path}`,{...init,headers:{"x-api-key":apiCredential(),Authorization:`Bearer ${token}`,...(init?.body?{"Content-Type":"application/x-www-form-urlencoded"}:{}),...(init?.headers||{})}});
  const text=await response.text();let payload:unknown={};try{payload=text?JSON.parse(text):{}}catch{payload={error:text}}
  if(!response.ok)throw new Error(typeof payload==="object"&&payload&&"error" in payload?String((payload as {error:unknown}).error):`Etsy returned ${response.status}.`);
  return payload as T;
}
