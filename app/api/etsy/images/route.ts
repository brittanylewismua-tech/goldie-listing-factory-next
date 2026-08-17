import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";

type Runtime={DB:D1Database;ARTWORK:R2Bucket};
const runtime=()=>env as unknown as Runtime;
const safeName=(value:string)=>value.replace(/[^a-z0-9._-]+/gi,"-").slice(0,100)||"listing-image.jpg";

export async function POST(request:Request){
  const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to save listing images."},{status:401});
  const form=await request.formData(),productId=String(form.get("productId")||""),kind=String(form.get("kind")||"mockup"),file=form.get("file");
  if(!productId||!(file instanceof File)||!/^image\/(png|jpeg|webp)$/i.test(file.type))return NextResponse.json({error:"Choose a PNG, JPG, or WEBP listing image."},{status:400});
  if(file.size>20*1024*1024)return NextResponse.json({error:"Each Etsy listing image must be 20 MB or smaller."},{status:413});
  const owned=await runtime().DB.prepare("SELECT 1 FROM printify_draft_results WHERE user_id=? AND status='succeeded' AND json_extract(response_json,'$.id')=? LIMIT 1").bind(user.userId,productId).first();
  if(!owned)return NextResponse.json({error:"That Printify draft does not belong to this Listing Factory account."},{status:403});
  const prefix=`etsy-listing-images/${user.userId}/${productId}/${kind==="size-guide"?"size-guide":"mockup"}/`;
  if(kind==="size-guide"){const existing=await runtime().ARTWORK.list({prefix});await Promise.all(existing.objects.map(object=>runtime().ARTWORK.delete(object.key)))}
  if(kind!=="size-guide"){const existing=await runtime().ARTWORK.list({prefix,limit:5});if(existing.objects.length>=4)return NextResponse.json({error:"Each listing can have up to four Goldie-generated lifestyle mockups."},{status:409})}
  const key=`${prefix}${crypto.randomUUID()}-${safeName(file.name)}`;
  await runtime().ARTWORK.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type},customMetadata:{name:safeName(file.name)}});
  return NextResponse.json({ok:true,key,name:file.name});
}

export async function DELETE(request:Request){
  const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to remove listing images."},{status:401});
  const url=new URL(request.url),productId=url.searchParams.get("productId")||"",kind=url.searchParams.get("kind")||"";if(!productId)return NextResponse.json({error:"Choose a listing."},{status:400});
  const prefix=`etsy-listing-images/${user.userId}/${productId}/${kind==="mockup"?"mockup/":kind==="size-guide"?"size-guide/":""}`;let cursor:string|undefined;
  do{const page=await runtime().ARTWORK.list({prefix,cursor});await Promise.all(page.objects.map(object=>runtime().ARTWORK.delete(object.key)));cursor=page.truncated?page.cursor:undefined}while(cursor);
  return NextResponse.json({ok:true});
}
