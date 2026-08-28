import { env } from "cloudflare:workers";
import { zipSync } from "fflate";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";

type Runtime={DB:D1Database;ARTWORK:R2Bucket};
type StoredDraft={id:string;title?:string;name?:string;printifyImages?:string[]};
const runtime=()=>env as unknown as Runtime;
const safeName=(value:string)=>value.replace(/[^a-z0-9._-]+/gi,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,90)||"listing";
const extension=(type:string,url:string)=>type.includes("png")?"png":type.includes("webp")?"webp":type.includes("jpeg")?"jpg":url.match(/\.(png|webp|jpe?g)(?:\?|$)/i)?.[1]?.replace("jpeg","jpg").toLowerCase()||"jpg";

export async function POST(request:Request){
  const user=await getChatGPTUser();
  if(!user)return NextResponse.json({error:"Sign in to download listing photos."},{status:401});
  const body=await request.json() as {productId?:string;printifyImageIndices?:number[]};
  const productId=String(body.productId||"");
  if(!productId)return NextResponse.json({error:"Choose a listing first."},{status:400});
  const row=await runtime().DB.prepare("SELECT response_json FROM printify_draft_results WHERE user_id=? AND status='succeeded' AND json_extract(response_json,'$.id')=? LIMIT 1").bind(user.userId,productId).first<{response_json:string}>();
  if(!row)return NextResponse.json({error:"That Printify draft does not belong to this Listing Factory account."},{status:403});
  const draft=JSON.parse(row.response_json) as StoredDraft,available=(draft.printifyImages||[]).filter(Boolean);
  const chosen=[...new Set((body.printifyImageIndices||[]).map(Number).filter(index=>Number.isInteger(index)&&index>=0&&index<available.length))];
  const files:Record<string,Uint8Array>={},base=safeName(draft.title||draft.name||"listing");
  let total=0;
  for(const [position,index] of chosen.entries()){
    const url=available[index],response=await fetch(url);
    if(!response.ok)continue;
    const bytes=new Uint8Array(await response.arrayBuffer());total+=bytes.byteLength;
    if(total>90*1024*1024)return NextResponse.json({error:"These photos are too large to package together. Download fewer Printify photos, then try again."},{status:413});
    files[`01-printify/${String(position+1).padStart(2,"0")}-printify.${extension(response.headers.get("content-type")||"",url)}`]=bytes;
  }
  const prefix=`etsy-listing-images/${user.userId}/${productId}/`,objects=await runtime().ARTWORK.list({prefix,limit:30});
  const additional=objects.objects.filter(object=>object.key.includes("/mockup/")||object.key.includes("/upload/"));
  for(const [position,object] of additional.entries()){
    const stored=await runtime().ARTWORK.get(object.key);if(!stored)continue;
    const bytes=new Uint8Array(await stored.arrayBuffer());total+=bytes.byteLength;
    if(total>90*1024*1024)return NextResponse.json({error:"These photos are too large to package together. Download fewer Printify photos, then try again."},{status:413});
    const name=stored.customMetadata?.name||object.key.split("/").at(-1)||`photo-${position+1}.jpg`;
    files[`02-additional-photos/${String(position+1).padStart(2,"0")}-${safeName(name)}`]=bytes;
  }
  if(!Object.keys(files).length)return NextResponse.json({error:"Choose at least one Printify photo or upload a listing photo first."},{status:400});
  const zip=zipSync(files,{level:0});
  return new Response(zip,{headers:{"Content-Type":"application/zip","Content-Disposition":`attachment; filename="${base}-listing-photos.zip"`,"Cache-Control":"private, no-store"}});
}
