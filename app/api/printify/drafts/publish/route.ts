import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { decryptPrintifyToken } from "../../token-crypto";

export async function POST(request:Request){
  const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to publish these listings."},{status:401});
  const body=await request.json() as {productIds?:string[]},ids=[...new Set((body.productIds||[]).map(String).filter(Boolean))];
  if(!ids.length)return NextResponse.json({error:"Choose at least one completed listing."},{status:400});
  const rows=await env.DB.prepare(`SELECT response_json FROM printify_draft_results WHERE user_id=? AND status='succeeded' AND json_extract(response_json,'$.id') IN (${ids.map(()=>"?").join(",")})`).bind(user.userId,...ids).all<{response_json:string}>();
  if(rows.results.length!==ids.length)return NextResponse.json({error:"One or more listings do not belong to this Goldie account."},{status:403});
  const connection=await env.DB.prepare("SELECT encrypted_token FROM printify_connections WHERE user_id=?").bind(user.userId).first<{encrypted_token:string}>(),secret=(env as unknown as {PRINTIFY_TOKEN_KEY?:string}).PRINTIFY_TOKEN_KEY;
  if(!connection||!secret)return NextResponse.json({error:"Reconnect Printify before publishing."},{status:401});
  const token=await decryptPrintifyToken(connection.encrypted_token,secret),published:string[]=[];
  for(const row of rows.results){const draft=JSON.parse(row.response_json) as {id:string;shopId:number};const response=await fetch(`https://api.printify.com/v1/shops/${draft.shopId}/products/${draft.id}/publish.json`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","User-Agent":"Goldie-Listing-Factory"},body:JSON.stringify({title:true,description:true,images:true,variants:true,tags:true,keyFeatures:true,shipping_template:true})});if(!response.ok)return NextResponse.json({error:`Printify stopped after ${published.length} listings because ${draft.id} could not be published (${response.status}).`,published},{status:response.status});published.push(draft.id)}
  return NextResponse.json({ok:true,published});
}
