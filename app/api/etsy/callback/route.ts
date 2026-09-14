import { oauthReturnOrigin } from "../return-origin";
import { forgetPairings } from "../../static-cache";
import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { apiKey, encryptEtsy, etsyFetch, goldieSiteUrl } from "../client";
import { etsyOauthIntent, sameEtsyShopMessage, wrongEtsyAccountMessage } from "@/app/etsy-connect-intent";

export async function GET(request:Request){
  const url=new URL(request.url),state=url.searchParams.get("state")||"",code=url.searchParams.get("code")||"",denied=url.searchParams.get("error"),intent=etsyOauthIntent(state),adding=intent==="add";
  const pending=state?await env.DB.prepare("SELECT user_id,code_verifier,redirect_uri,return_origin,target_shop_id FROM etsy_oauth_states WHERE state=? AND expires_at>unixepoch()").bind(state).first<{user_id:string;code_verifier:string;redirect_uri:string;return_origin?:string|null;target_shop_id?:number|null}>():null;
  const returnOrigin=oauthReturnOrigin(pending?.return_origin||url.origin,goldieSiteUrl());
  const fail=(message:string)=>NextResponse.redirect(`${returnOrigin}/listing-factory?step=connect&etsy=${encodeURIComponent(message)}`);
  if(denied){if(pending)await env.DB.prepare("DELETE FROM etsy_oauth_states WHERE state=?").bind(state).run();return fail("Etsy connection was canceled.")}
  if(!pending||!code)return fail("Etsy connection expired. Try connecting again.");
  await env.DB.prepare("DELETE FROM etsy_oauth_states WHERE state=?").bind(state).run();
  try{
    const tokenResponse=await fetch("https://api.etsy.com/v3/public/oauth/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",client_id:apiKey(),redirect_uri:pending.redirect_uri,code,code_verifier:pending.code_verifier}),signal:AbortSignal.timeout(25000)}),tokens=await tokenResponse.json() as {access_token?:string;refresh_token?:string;expires_in?:number;scope?:string;error_description?:string};
    if(!tokenResponse.ok||!tokens.access_token||!tokens.refresh_token)throw new Error(tokens.error_description||"Etsy did not complete the connection.");
    const etsyUserId=Number(tokens.access_token.split(".")[0]);if(!etsyUserId)throw new Error("Etsy did not return a valid account identifier.");
    const shop=await etsyFetch<{shop_id:number;shop_name:string}>(`/users/${etsyUserId}/shops`,tokens.access_token);
    if(!shop||!Number.isSafeInteger(Number(shop.shop_id))||Number(shop.shop_id)<=0||!shop.shop_name)throw new Error("No Etsy shop was found on this account. Connect an account with an existing Etsy shop.");
    /*
      SHOP MAP ASKED FOR SALES ACCESS ON ONE SAVED SHOP.

      This authorisation is about permission, not about which shop the Listing
      Factory publishes to, so it writes the new token and the granted scopes
      against the intended connection and changes nothing else. is_active is
      not touched by any statement on this path.

      And it verifies first: Etsy hands back whichever account was signed in,
      so an authorisation that came back owning a different shop is refused
      outright. Both saved connections survive that, untouched — writing the
      new token over the wrong row would quietly point one shop's Shop Map at
      another shop's money.
    */
    if(intent==="sales"&&pending.target_shop_id){
      const intended=await env.DB.prepare("SELECT shop_name FROM etsy_connections WHERE user_id=? AND shop_id=?").bind(pending.user_id,pending.target_shop_id).first<{shop_name:string}>();
      if(Number(shop.shop_id)!==Number(pending.target_shop_id))
        return fail(wrongEtsyAccountMessage(intended?.shop_name||"that shop"));
      await env.DB.prepare("UPDATE etsy_connections SET encrypted_access_token=?, encrypted_refresh_token=?, expires_at=?, etsy_user_id=?, shop_name=?, scopes=?, scopes_checked_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND shop_id=?")
        .bind(await encryptEtsy(tokens.access_token),await encryptEtsy(tokens.refresh_token),Math.floor(Date.now()/1000)+Number(tokens.expires_in||3600),etsyUserId,shop.shop_name,String(tokens.scope||""),pending.user_id,pending.target_shop_id).run();
      return NextResponse.redirect(`${returnOrigin}/api/shop-map/capability?shop=${pending.target_shop_id}`);
    }

    const existing=adding?await env.DB.prepare("SELECT shop_name,is_active FROM etsy_connections WHERE user_id=? AND shop_id=?").bind(pending.user_id,shop.shop_id).first<{shop_name:string;is_active:number}>():null;
    if(existing?.is_active===1){
      /* Refreshing the grant is harmless and useful, but an add-shop attempt
         must not change the active destination or advance the workflow when
         Etsy silently reused the browser's current login. */
      await env.DB.prepare("UPDATE etsy_connections SET scopes=?, scopes_checked_at=CURRENT_TIMESTAMP WHERE user_id=? AND shop_id=?").bind(String(tokens.scope||""),pending.user_id,shop.shop_id).run().catch(()=>{});
      await env.DB.prepare("UPDATE etsy_connections SET encrypted_access_token=?, encrypted_refresh_token=?, expires_at=?, etsy_user_id=?, shop_name=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND shop_id=?")
        .bind(await encryptEtsy(tokens.access_token),await encryptEtsy(tokens.refresh_token),Math.floor(Date.now()/1000)+Number(tokens.expires_in||3600),etsyUserId,shop.shop_name,pending.user_id,shop.shop_id).run();
      return fail(sameEtsyShopMessage(shop.shop_name));
    }
    /* D835 · A second shop is added, not swapped in. The one just authorised
       becomes active; the others stay connected and switchable. */
    await env.DB.batch([
      env.DB.prepare("UPDATE etsy_connections SET is_active=0 WHERE user_id=?").bind(pending.user_id),
      env.DB.prepare("INSERT INTO etsy_connections (user_id,shop_id,encrypted_access_token,encrypted_refresh_token,expires_at,etsy_user_id,shop_name,is_active,updated_at) VALUES (?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(user_id,shop_id) DO UPDATE SET encrypted_access_token=excluded.encrypted_access_token, encrypted_refresh_token=excluded.encrypted_refresh_token, expires_at=excluded.expires_at, etsy_user_id=excluded.etsy_user_id, shop_name=excluded.shop_name, is_active=1, updated_at=CURRENT_TIMESTAMP")
        .bind(pending.user_id,shop.shop_id,await encryptEtsy(tokens.access_token),await encryptEtsy(tokens.refresh_token),Math.floor(Date.now()/1000)+Number(tokens.expires_in||3600),etsyUserId,shop.shop_name),
    ]);
    /* What Etsy actually granted, recorded against the connection. Shop Map
       reads this to decide whether it can ask for receipts, and a grant that
       silently came back narrower than requested has to be visible rather
       than discovered as a 403 later. */
    /* What Etsy actually granted, recorded against the connection. Shop Map
       reads this to decide whether it can ask for receipts, and a grant that
       came back narrower than requested has to be visible here rather than
       discovered as a 403 three screens later. Written inline rather than
       through a helper so the callback keeps its single dependency list.
       Tolerant of a missing column: the ALTER runs on Shop Map's first use. */
    await env.DB.prepare("UPDATE etsy_connections SET scopes=?, scopes_checked_at=CURRENT_TIMESTAMP WHERE user_id=? AND shop_id=?").bind(String(tokens.scope||""),pending.user_id,shop.shop_id).run().catch(()=>{});
    /* D661 · Reconnecting can land on a different Etsy shop, so a proof about
       THIS shop is void - it was made against whatever was connected before.
       D835 · Proofs for other shops are keyed by (printify shop, etsy shop) and
       stay valid, which is what makes switching instant rather than a
       re-verification of everything the seller owns. */
    await forgetPairings(pending.user_id,shop.shop_id);
    return NextResponse.redirect(`${returnOrigin}/listing-factory?etsy=connected`);
  }catch(error){return fail(error instanceof Error&&["TimeoutError","AbortError"].includes(error.name)?"Etsy took too long to finish connecting. Your saved connections are unchanged. Try connecting again.":error instanceof Error?error.message:"Etsy connection failed.")}
}
