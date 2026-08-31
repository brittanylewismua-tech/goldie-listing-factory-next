import { forgetPairings } from "../../static-cache";
import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { apiKey, encryptEtsy, etsyFetch, goldieSiteUrl } from "../client";

export async function GET(request:Request){
  const url=new URL(request.url),state=url.searchParams.get("state")||"",code=url.searchParams.get("code")||"",denied=url.searchParams.get("error");
  const returnOrigin=goldieSiteUrl();
  const fail=(message:string)=>NextResponse.redirect(`${returnOrigin}/?etsy=${encodeURIComponent(message)}`);
  if(denied)return fail("Etsy connection was canceled.");
  const pending=await env.DB.prepare("SELECT user_id,code_verifier,redirect_uri FROM etsy_oauth_states WHERE state=? AND expires_at>unixepoch()").bind(state).first<{user_id:string;code_verifier:string;redirect_uri:string}>();
  if(!pending||!code)return fail("Etsy connection expired. Try connecting again.");
  await env.DB.prepare("DELETE FROM etsy_oauth_states WHERE state=?").bind(state).run();
  try{
    const tokenResponse=await fetch("https://api.etsy.com/v3/public/oauth/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",client_id:apiKey(),redirect_uri:pending.redirect_uri,code,code_verifier:pending.code_verifier})}),tokens=await tokenResponse.json() as {access_token?:string;refresh_token?:string;expires_in?:number;error_description?:string};
    if(!tokenResponse.ok||!tokens.access_token||!tokens.refresh_token)throw new Error(tokens.error_description||"Etsy did not complete the connection.");
    const etsyUserId=Number(tokens.access_token.split(".")[0]);if(!etsyUserId)throw new Error("Etsy did not return a valid account identifier.");
    const shop=await etsyFetch<{shop_id:number;shop_name:string}>(`/users/${etsyUserId}/shops`,tokens.access_token);
    if(!shop)throw new Error("No Etsy shop was found on this account.");
    /* D835 · A second shop is added, not swapped in. The one just authorised
       becomes active; the others stay connected and switchable. */
    await env.DB.batch([
      env.DB.prepare("UPDATE etsy_connections SET is_active=0 WHERE user_id=?").bind(pending.user_id),
      env.DB.prepare("INSERT INTO etsy_connections (user_id,shop_id,encrypted_access_token,encrypted_refresh_token,expires_at,etsy_user_id,shop_name,is_active,updated_at) VALUES (?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(user_id,shop_id) DO UPDATE SET encrypted_access_token=excluded.encrypted_access_token, encrypted_refresh_token=excluded.encrypted_refresh_token, expires_at=excluded.expires_at, etsy_user_id=excluded.etsy_user_id, shop_name=excluded.shop_name, is_active=1, updated_at=CURRENT_TIMESTAMP")
        .bind(pending.user_id,shop.shop_id,await encryptEtsy(tokens.access_token),await encryptEtsy(tokens.refresh_token),Math.floor(Date.now()/1000)+Number(tokens.expires_in||3600),etsyUserId,shop.shop_name),
    ]);
    /* D661 · Reconnecting can land on a different Etsy shop, so a proof about
       THIS shop is void - it was made against whatever was connected before.
       D835 · Proofs for other shops are keyed by (printify shop, etsy shop) and
       stay valid, which is what makes switching instant rather than a
       re-verification of everything the seller owns. */
    await forgetPairings(pending.user_id,shop.shop_id);
    return NextResponse.redirect(`${returnOrigin}/?etsy=connected`);
  }catch(error){return fail(error instanceof Error?error.message:"Etsy connection failed.")}
}
