import { oauthReturnOrigin } from "./return-origin";
import { forgetPairings } from "../static-cache";
import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { BASE_SCOPES, SHOP_MAP_SCOPES } from "@/app/shop-map-auth";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { apiKey, etsyConnection, etsyRedirectUri, goldieSiteUrl } from "./client";
import { etsyOauthState } from "@/app/etsy-connect-intent";

function base64url(bytes:Uint8Array){let value="";for(const byte of bytes)value+=String.fromCharCode(byte);return btoa(value).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}

export async function GET(){
  const user=await getChatGPTUser();if(!user)return NextResponse.json({connected:false},{status:401});
  /* D835 · Several shops can be connected. The active one is the shop this
     seller is working in; the list is what the switcher offers. */
  /* A retired connection has no token and is not a shop the seller can publish
     to, so it stays out of the switcher. The row survives only so that
     reconnecting restores a shop rather than rebuilding one. */
  const rows=await env.DB.prepare("SELECT shop_id, shop_name, is_active FROM etsy_connections WHERE user_id=? AND encrypted_access_token<>'' ORDER BY shop_name").bind(user.userId).all<{shop_id:number;shop_name:string;is_active:number}>();
  const shops=(rows.results||[]).map(row=>({shopId:row.shop_id,shopName:row.shop_name,active:row.is_active===1}));
  const active=shops.find(shop=>shop.active);
  if(!active)return NextResponse.json({connected:false,shops});
  /* A row is not proof of a usable Etsy connection. Access tokens expire and
     refresh tokens can be revoked; reporting "connected" from the row alone
     let the workflow claim shipping was saved while every Etsy request failed.
     etsyConnection decrypts the token and refreshes it when necessary, so the
     status shown to the seller now reflects the connection the workflow can
     actually use. */
  try{
    await etsyConnection(user.userId);
    return NextResponse.json({connected:true,shopId:active.shopId,shopName:active.shopName,shops});
  }catch(error){
    return NextResponse.json({connected:false,shops,error:error instanceof Error?error.message:"Reconnect Etsy to continue."});
  }
}

export async function POST(request:Request){
  const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in before connecting Etsy."},{status:401});
  try{
    const body=await request.json().catch(()=>({})) as {intent?:string};
    /* A normal first connection can accept the Etsy account already in the
       browser. Adding a shop cannot: Etsy has one shop per login and does not
       expose a supported account-picker parameter. Carry the seller's intent
       in the single-use random state so the callback can refuse to pretend that
       authorising the same shop again added a different one. */
    const adding=body.intent==="add",redirectUri=etsyRedirectUri(),state=etsyOauthState(adding?"add":"connect",base64url(crypto.getRandomValues(new Uint8Array(24)))),verifier=base64url(crypto.getRandomValues(new Uint8Array(48))),digest=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier))),challenge=base64url(digest);
    await env.DB.batch([env.DB.prepare("DELETE FROM etsy_oauth_states WHERE expires_at<=unixepoch()"),env.DB.prepare("INSERT INTO etsy_oauth_states (state,user_id,code_verifier,redirect_uri,return_origin,expires_at) VALUES (?,?,?,?,?,unixepoch()+600)").bind(state,user.userId,verifier,redirectUri,oauthReturnOrigin(request.url,goldieSiteUrl()))]);
    /* Shop Map is the only thing that needs receipts, so it is the only
       thing that asks for them. Everyone else keeps the narrower grant, and
       the existing connection keeps working either way — the callback only
       replaces it once Etsy has actually returned a token. */
    const scope=body.intent==="sales"?SHOP_MAP_SCOPES:BASE_SCOPES;
    const params=new URLSearchParams({response_type:"code",redirect_uri:redirectUri,scope,client_id:apiKey(),state,code_challenge:challenge,code_challenge_method:"S256"});
    return NextResponse.json({authorizeUrl:`https://www.etsy.com/oauth/connect?${params}`});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Etsy connection could not start."},{status:500})}
}

export async function DELETE(){const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to continue."},{status:401});
  /*
    DISCONNECTING IS NOT DELETING ANY MORE.

    This statement used to be `DELETE FROM etsy_connections WHERE user_id=?
    AND is_active=1`, and on 14 September it removed a seller's active shop
    during a run of failed authorisations. Reconstructing what had happened
    was only possible by elimination — it is the sole statement in the
    codebase that can remove a connection — because nothing recorded that it
    ran. A destructive operation with no audit trail turns a real defect into
    an argument about whether somebody clicked something.

    So the row is retired rather than destroyed: the tokens are cleared, which
    is what disconnecting is actually for, and the identity stays. Reconnecting
    then restores a shop instead of rebuilding it, and every removal is
    recorded below.
  */
  const going=await env.DB.prepare("SELECT shop_id,shop_name FROM etsy_connections WHERE user_id=? AND is_active=1").bind(user.userId).first<{shop_id:number;shop_name:string}>();
  if(going){
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS etsy_connection_events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, shop_id INTEGER NOT NULL, shop_name TEXT NOT NULL DEFAULT '', action TEXT NOT NULL, at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run().catch(()=>{});
    await env.DB.prepare("INSERT INTO etsy_connection_events (user_id,shop_id,shop_name,action) VALUES (?,?,?,'disconnected')").bind(user.userId,going.shop_id,going.shop_name||"").run().catch(()=>{});
    /* Retired, not removed: no token, not active, still known. */
    await env.DB.prepare("UPDATE etsy_connections SET encrypted_access_token='', encrypted_refresh_token='', expires_at=0, is_active=0, updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND shop_id=?").bind(user.userId,going.shop_id).run();
  }
  /* D835 · Another shop may remain; promote it so "disconnect" never leaves
     the seller connected to nothing while other shops are still authorised. */
  const next=await env.DB.prepare("SELECT shop_id, shop_name FROM etsy_connections WHERE user_id=? AND encrypted_access_token<>'' ORDER BY updated_at DESC LIMIT 1").bind(user.userId).first<{shop_id:number;shop_name:string}>();
  if(next)await env.DB.prepare("UPDATE etsy_connections SET is_active=1 WHERE user_id=? AND shop_id=?").bind(user.userId,next.shop_id).run();
  /* D661 · A pairing proof is about one Etsy shop. Disconnecting voids it. */
  await forgetPairings(user.userId,going?.shop_id);
  /* D836 · Disconnecting one shop while others remain does not disconnect the
     seller, and saying {connected:false} made the UI clear Etsy entirely. */
  return NextResponse.json(next?{connected:true,shopId:next.shop_id,shopName:next.shop_name}:{connected:false})}
