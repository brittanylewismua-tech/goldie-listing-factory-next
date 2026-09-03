import { forgetPairings } from "../static-cache";
import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { apiKey, etsyConnection, etsyRedirectUri } from "./client";

function base64url(bytes:Uint8Array){let value="";for(const byte of bytes)value+=String.fromCharCode(byte);return btoa(value).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}

export async function GET(){
  const user=await getChatGPTUser();if(!user)return NextResponse.json({connected:false},{status:401});
  /* D835 · Several shops can be connected. The active one is the shop this
     seller is working in; the list is what the switcher offers. */
  const rows=await env.DB.prepare("SELECT shop_id, shop_name, is_active FROM etsy_connections WHERE user_id=? ORDER BY shop_name").bind(user.userId).all<{shop_id:number;shop_name:string;is_active:number}>();
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

export async function POST(){
  const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in before connecting Etsy."},{status:401});
  try{
    const redirectUri=etsyRedirectUri(),state=base64url(crypto.getRandomValues(new Uint8Array(24))),verifier=base64url(crypto.getRandomValues(new Uint8Array(48))),digest=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier))),challenge=base64url(digest);
    await env.DB.batch([env.DB.prepare("DELETE FROM etsy_oauth_states WHERE expires_at<=unixepoch()"),env.DB.prepare("INSERT INTO etsy_oauth_states (state,user_id,code_verifier,redirect_uri,expires_at) VALUES (?,?,?,?,unixepoch()+600)").bind(state,user.userId,verifier,redirectUri)]);
    const params=new URLSearchParams({response_type:"code",redirect_uri:redirectUri,scope:"listings_r listings_w shops_r shops_w",client_id:apiKey(),state,code_challenge:challenge,code_challenge_method:"S256"});
    return NextResponse.json({authorizeUrl:`https://www.etsy.com/oauth/connect?${params}`});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Etsy connection could not start."},{status:500})}
}

export async function DELETE(){const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to continue."},{status:401});/* D835 · Disconnect the shop the seller is in, and promote another if one
  remains, so "disconnect" never leaves them connected to nothing while other
  shops are still authorised. */
  const going=await env.DB.prepare("SELECT shop_id FROM etsy_connections WHERE user_id=? AND is_active=1").bind(user.userId).first<{shop_id:number}>();
  await env.DB.prepare("DELETE FROM etsy_connections WHERE user_id=? AND is_active=1").bind(user.userId).run();
  const next=await env.DB.prepare("SELECT shop_id, shop_name FROM etsy_connections WHERE user_id=? ORDER BY updated_at DESC LIMIT 1").bind(user.userId).first<{shop_id:number;shop_name:string}>();
  if(next)await env.DB.prepare("UPDATE etsy_connections SET is_active=1 WHERE user_id=? AND shop_id=?").bind(user.userId,next.shop_id).run();/* D661 · A pairing proof is about one Etsy shop. Disconnecting voids it. */await forgetPairings(user.userId,going?.shop_id);/* D836 · Disconnecting one shop while others remain does not disconnect the
  seller. Saying {connected:false} made the UI clear Etsy entirely while a
  promoted shop was live, so the next publish would have used a connection the
  screen said did not exist. */
  return NextResponse.json(next?{connected:true,shopId:next.shop_id,shopName:next.shop_name}:{connected:false})}
