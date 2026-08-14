import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { decryptPrintifyToken } from "../../token-crypto";

export async function PATCH(request:Request){
  const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to update this draft."},{status:401});
  const body=await request.json() as {productId?:string;title?:string;tags?:string[];description?:string;etsyDetails?:unknown},productId=String(body.productId||"");
  const owned=await env.DB.prepare("SELECT response_json FROM printify_draft_results WHERE user_id=? AND status='succeeded' AND json_extract(response_json,'$.id')=? LIMIT 1").bind(user.userId,productId).first<{response_json:string}>();
  if(!owned)return NextResponse.json({error:"That Printify draft was not created by this Goldie account."},{status:404});
  const draft=JSON.parse(owned.response_json) as {shopId:number},connection=await env.DB.prepare("SELECT encrypted_token FROM printify_connections WHERE user_id=?").bind(user.userId).first<{encrypted_token:string}>(),secret=(env as unknown as {PRINTIFY_TOKEN_KEY?:string}).PRINTIFY_TOKEN_KEY;
  if(!connection||!secret)return NextResponse.json({error:"Reconnect Printify to update this draft."},{status:401});
  const token=await decryptPrintifyToken(connection.encrypted_token,secret),response=await fetch(`https://api.printify.com/v1/shops/${draft.shopId}/products/${productId}.json`,{method:"PUT",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","User-Agent":"Goldie-Listing-Factory"},body:JSON.stringify({title:String(body.title||"").slice(0,255),description:String(body.description||""),tags:(body.tags||[]).slice(0,13)})});
  if(!response.ok)return NextResponse.json({error:`Printify could not update this draft (${response.status}).`},{status:response.status});
  const stored={...draft,title:String(body.title||"").slice(0,255),tags:(body.tags||[]).slice(0,13),description:String(body.description||""),etsyDetails:body.etsyDetails||null};
  await env.DB.prepare("UPDATE printify_draft_results SET response_json=? WHERE user_id=? AND status='succeeded' AND json_extract(response_json,'$.id')=?").bind(JSON.stringify(stored),user.userId,productId).run();
  return NextResponse.json({ok:true});
}
