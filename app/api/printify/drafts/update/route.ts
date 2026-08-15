import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { decryptPrintifyToken } from "../../token-crypto";

export async function PATCH(request:Request){
  const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to update this draft."},{status:401});
  const body=await request.json() as {productId?:string;title?:string;tags?:string[];description?:string;etsyDetails?:unknown;placement?:{x:number;y:number;scale:number}},productId=String(body.productId||"");
  const owned=await env.DB.prepare("SELECT response_json FROM printify_draft_results WHERE user_id=? AND status='succeeded' AND json_extract(response_json,'$.id')=? LIMIT 1").bind(user.userId,productId).first<{response_json:string}>();
  if(!owned)return NextResponse.json({error:"That Printify draft was not created by this Goldie account."},{status:404});
  const draft=JSON.parse(owned.response_json) as {shopId:number},connection=await env.DB.prepare("SELECT encrypted_token FROM printify_connections WHERE user_id=?").bind(user.userId).first<{encrypted_token:string}>(),secret=(env as unknown as {PRINTIFY_TOKEN_KEY?:string}).PRINTIFY_TOKEN_KEY;
  if(!connection||!secret)return NextResponse.json({error:"Reconnect Printify to update this draft."},{status:401});
  const token=await decryptPrintifyToken(connection.encrypted_token,secret),url=`https://api.printify.com/v1/shops/${draft.shopId}/products/${productId}.json`;
  let placementPayload:unknown;
  if(body.placement){
    const currentResponse=await fetch(url,{headers:{Authorization:`Bearer ${token}`,"User-Agent":"Goldie-Listing-Factory"}});
    if(!currentResponse.ok)return NextResponse.json({error:`Printify could not load this draft (${currentResponse.status}).`},{status:currentResponse.status});
    const current=await currentResponse.json() as {print_areas?:Array<{variant_ids:number[];background?:string;placeholders?:Array<{position:string;images?:Array<{id?:string;x?:number;y?:number;scale?:number;angle?:number}>}>}>};
    placementPayload=(current.print_areas||[]).map(area=>({...area,placeholders:(area.placeholders||[]).map(placeholder=>({...placeholder,images:(placeholder.images||[]).map(image=>({...image,x:Math.max(0,Math.min(1,body.placement!.x)),y:Math.max(0,Math.min(1,body.placement!.y)),scale:Math.max(.05,Math.min(3,body.placement!.scale))}))}))}));
  }
  const updateBody:Record<string,unknown>={};
  if(body.title!==undefined)updateBody.title=String(body.title||"").slice(0,255);
  if(body.description!==undefined)updateBody.description=String(body.description||"");
  if(body.tags!==undefined)updateBody.tags=(body.tags||[]).slice(0,13);
  if(placementPayload)updateBody.print_areas=placementPayload;
  const response=await fetch(url,{method:"PUT",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","User-Agent":"Goldie-Listing-Factory"},body:JSON.stringify(updateBody)});
  if(!response.ok)return NextResponse.json({error:`Printify could not update this draft (${response.status}).`},{status:response.status});
  const updated=await response.json().catch(()=>({})) as {images?:Array<{src?:string;is_default?:boolean}>};
  const stored={...draft,...(body.title!==undefined?{title:String(body.title||"").slice(0,255)}:{}),...(body.tags!==undefined?{tags:(body.tags||[]).slice(0,13)}:{}),...(body.description!==undefined?{description:String(body.description||"")}:{}) ,...(body.etsyDetails!==undefined?{etsyDetails:body.etsyDetails||null}:{}),...(body.placement?{placement:body.placement}:{}),...(updated.images?{printifyImages:updated.images.map(image=>image.src).filter(Boolean),previewUrl:updated.images.find(image=>image.is_default)?.src||updated.images[0]?.src}: {})};
  await env.DB.prepare("UPDATE printify_draft_results SET response_json=? WHERE user_id=? AND status='succeeded' AND json_extract(response_json,'$.id')=?").bind(JSON.stringify(stored),user.userId,productId).run();
  return NextResponse.json({ok:true,draft:stored});
}
