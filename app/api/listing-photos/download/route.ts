import { env } from "cloudflare:workers";
import { zipSync } from "fflate";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { unpackDraftMedia } from "@/app/draft-media-storage";
import { orderedPackagePhotos,loadPhotoPackage } from "@/app/listing-photo-package";

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
  const draft=await unpackDraftMedia(row.response_json,user.userId,runtime().ARTWORK) as StoredDraft,available=(draft.printifyImages||[]).filter(Boolean);
  const prefix=`etsy-listing-images/${user.userId}/${productId}/`,objects=await runtime().ARTWORK.list({prefix,limit:100});
  if(objects.truncated)return NextResponse.json({error:"This listing has too many stored photos to package. Remove unused photos and try again."},{status:413});
  const orderObject=await runtime().ARTWORK.get(`${prefix}order.json`);let order:unknown=[];
  if(orderObject){try{order=JSON.parse(await orderObject.text())}catch{return NextResponse.json({error:"Save the photo order again before downloading."},{status:409})}}
  const photos=orderedPackagePhotos(available,(body.printifyImageIndices||[]).map(Number),objects.objects,prefix,order);
  let files:Record<string,Uint8Array>;
  try{files=await loadPhotoPackage(photos,async photo=>{
    if(photo.src){const response=await fetch(photo.src);if(!response.ok)throw new Error("A selected Printify photo could not be downloaded. Try again.");return {bytes:new Uint8Array(await response.arrayBuffer()),extension:extension(response.headers.get("content-type")||"",photo.src)}}
    const stored=await runtime().ARTWORK.get(photo.key!);if(!stored)throw new Error("A listing photo is no longer available. Refresh the photo list and try again.");
    return {bytes:new Uint8Array(await stored.arrayBuffer()),extension:extension(stored.httpMetadata?.contentType||"",photo.key!)};
  })}catch(error){const message=error instanceof Error?error.message:"These photos could not be downloaded.";return NextResponse.json({error:message},{status:message.includes("too large")?413:502})}
  const base=safeName(draft.title||draft.name||"listing");
  if(!Object.keys(files).length)return NextResponse.json({error:"Choose at least one Printify photo or upload a listing photo first."},{status:400});
  const zip=zipSync(files,{level:0}) as Uint8Array<ArrayBuffer>;
  return new Response(zip,{headers:{"Content-Type":"application/zip","Content-Disposition":`attachment; filename="${base}-listing-photos.zip"`,"Cache-Control":"private, no-store"}});
}
