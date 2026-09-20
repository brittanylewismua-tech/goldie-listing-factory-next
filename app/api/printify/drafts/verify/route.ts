import {env} from "cloudflare:workers";
import {NextResponse} from "next/server";
import {getChatGPTUser} from "@/app/chatgpt-auth";
import {runBounded} from "@/app/bounded-work";
import {decryptPrintifyToken} from "../../token-crypto";

type StoredDraft={id?:string;shopId?:number};

export async function POST(request:Request){
  const user=await getChatGPTUser();
  if(!user)return NextResponse.json({error:"Sign in to check these Printify drafts."},{status:401});
  const body=await request.json() as {productIds?:string[]};
  const productIds=[...new Set((body.productIds||[]).map(String).filter(Boolean))].slice(0,80);
  if(!productIds.length)return NextResponse.json({missing:[],errors:[]});
  const queries=productIds.map(id=>env.DB.prepare("SELECT response_json FROM printify_draft_results WHERE user_id=? AND status='succeeded' AND json_extract(response_json,'$.id')=? LIMIT 1").bind(user.userId,id));
  const rows=await env.DB.batch<{response_json:string}>(queries);
  const stored=new Map<string,StoredDraft>();
  rows.forEach((result,index)=>{const raw=result.results?.[0]?.response_json;if(!raw)return;try{stored.set(productIds[index],JSON.parse(raw) as StoredDraft)}catch{/* An unreadable owned record is unavailable. */}});
  const connection=await env.DB.prepare("SELECT encrypted_token FROM printify_connections WHERE user_id=?").bind(user.userId).first<{encrypted_token:string}>(),secret=(env as unknown as {PRINTIFY_TOKEN_KEY?:string}).PRINTIFY_TOKEN_KEY;
  if(!connection||!secret)return NextResponse.json({error:"Reconnect Printify to check these drafts."},{status:401});
  const token=await decryptPrintifyToken(connection.encrypted_token,secret);
  const missing=productIds.filter(id=>!stored.has(id)),errors:string[]=[];
  await runBounded([...stored.entries()],4,async([id,draft])=>{
    try{
      const response=await fetch(`https://api.printify.com/v1/shops/${Number(draft.shopId)||0}/products/${encodeURIComponent(id)}.json`,{headers:{Authorization:`Bearer ${token}`,"User-Agent":"Goldie-Listing-Factory"},signal:AbortSignal.timeout(12000)});
      if(response.status===404){missing.push(id);return}
      if(!response.ok)errors.push(`Printify could not confirm a saved draft (${response.status}). Try again.`);
    }catch{errors.push("Printify took too long to confirm a saved draft. Try again.")}
  });
  return NextResponse.json({missing:[...new Set(missing)],errors:[...new Set(errors)]});
}
