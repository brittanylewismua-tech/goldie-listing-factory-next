import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { apiKey, etsyRedirectUri } from "./client";

function base64url(bytes:Uint8Array){let value="";for(const byte of bytes)value+=String.fromCharCode(byte);return btoa(value).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}

export async function GET(){
  const user=await getChatGPTUser();if(!user)return NextResponse.json({connected:false},{status:401});
  const row=await env.DB.prepare("SELECT shop_id, shop_name FROM etsy_connections WHERE user_id=?").bind(user.userId).first<{shop_id:number;shop_name:string}>();
  return NextResponse.json(row?{connected:true,shopId:row.shop_id,shopName:row.shop_name}:{connected:false});
}

export async function POST(request:Request){
  const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in before connecting Etsy."},{status:401});
  try{
    const redirectUri=etsyRedirectUri(),state=base64url(crypto.getRandomValues(new Uint8Array(24))),verifier=base64url(crypto.getRandomValues(new Uint8Array(48))),digest=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier))),challenge=base64url(digest);
    await env.DB.batch([env.DB.prepare("DELETE FROM etsy_oauth_states WHERE expires_at<=unixepoch()"),env.DB.prepare("INSERT INTO etsy_oauth_states (state,user_id,code_verifier,redirect_uri,expires_at) VALUES (?,?,?,?,unixepoch()+600)").bind(state,user.userId,verifier,redirectUri)]);
    const params=new URLSearchParams({response_type:"code",redirect_uri:redirectUri,scope:"listings_r listings_w shops_r shops_w",client_id:apiKey(),state,code_challenge:challenge,code_challenge_method:"S256"});
    return NextResponse.json({authorizeUrl:`https://www.etsy.com/oauth/connect?${params}`});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Etsy connection could not start."},{status:500})}
}

export async function DELETE(){const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to continue."},{status:401});await env.DB.prepare("DELETE FROM etsy_connections WHERE user_id=?").bind(user.userId).run();return NextResponse.json({connected:false})}
