import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";

type Runtime={DB:D1Database;ARTWORK:R2Bucket};
const runtime=()=>env as unknown as Runtime;
const safeName=(value:string)=>value.replace(/[^a-z0-9._-]+/gi,"-").slice(0,100)||"listing-image.jpg";
const basePrefix=(userId:string,productId:string)=>`etsy-listing-images/${userId}/${productId}/`;
const ownsDraft=(userId:string,productId:string)=>runtime().DB.prepare("SELECT 1 FROM printify_draft_results WHERE user_id=? AND status='succeeded' AND json_extract(response_json,'$.id')=? LIMIT 1").bind(userId,productId).first();

export async function GET(request:Request){
  const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to view listing images."},{status:401});
  const url=new URL(request.url),productId=url.searchParams.get("productId")||"",key=url.searchParams.get("key")||"";
  if(!productId)return NextResponse.json({error:"Choose a listing."},{status:400});
  if(!await ownsDraft(user.userId,productId))return NextResponse.json({error:"That listing does not belong to this Listing Factory account."},{status:403});
  const prefix=basePrefix(user.userId,productId);
  if(key){if(!key.startsWith(prefix)||key.endsWith("order.json"))return NextResponse.json({error:"That listing image is not available."},{status:403});const object=await runtime().ARTWORK.get(key);if(!object)return NextResponse.json({error:"That listing image was not found."},{status:404});return new Response(object.body,{headers:{"Content-Type":object.httpMetadata?.contentType||"image/jpeg","Cache-Control":"private, max-age=300"}})}
  const stored=await runtime().ARTWORK.list({prefix,include:["customMetadata"]}),images=stored.objects.filter(object=>!object.key.endsWith("order.json")).map(object=>({id:`stored:${object.key}`,key:object.key,kind:object.key.includes("/size-guide/")?"size-guide":object.key.includes("/upload/")?"uploaded":"mockup",name:object.customMetadata?.name||object.key.split("/").pop()||"Listing image",src:`/api/etsy/images?productId=${encodeURIComponent(productId)}&key=${encodeURIComponent(object.key)}`}));
  const orderObject=await runtime().ARTWORK.get(`${prefix}order.json`);let order:string[]=[];if(orderObject)try{order=JSON.parse(await orderObject.text()) as string[]}catch{order=[]}
  return NextResponse.json({images,order});
}

export async function PUT(request:Request){
  const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to arrange listing images."},{status:401});
  const body=await request.json() as {productId?:string;order?:string[]},productId=String(body.productId||""),order=[...new Set((body.order||[]).map(String).filter(value=>value.startsWith("printify:")||value.startsWith("stored:")))].slice(0,20);
  if(!productId)return NextResponse.json({error:"Choose a listing."},{status:400});
  if(!await ownsDraft(user.userId,productId))return NextResponse.json({error:"That listing does not belong to this Listing Factory account."},{status:403});
  await runtime().ARTWORK.put(`${basePrefix(user.userId,productId)}order.json`,JSON.stringify(order),{httpMetadata:{contentType:"application/json"}});
  return NextResponse.json({ok:true,order});
}

export async function POST(request:Request){
  const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to save listing images."},{status:401});
  const form=await request.formData(),productId=String(form.get("productId")||""),requestedKind=String(form.get("kind")||"mockup"),kind=requestedKind==="size-guide"?"size-guide":requestedKind==="upload"?"upload":"mockup",replace=String(form.get("replace")||"")==="true",files=form.getAll("file").filter((value):value is File=>value instanceof File);
  if(!productId||!files.length||files.some(file=>!/^image\/(png|jpeg|webp)$/i.test(file.type)))return NextResponse.json({error:"Choose PNG, JPG, or WEBP listing images."},{status:400});
  if(files.length>20)return NextResponse.json({error:"Etsy allows up to 20 photos on one listing."},{status:409});
  if(files.some(file=>file.size>20*1024*1024))return NextResponse.json({error:"Each Etsy listing image must be 20 MB or smaller."},{status:413});
  const owned=await ownsDraft(user.userId,productId);
  if(!owned)return NextResponse.json({error:"That Printify draft does not belong to this Listing Factory account."},{status:403});
  const prefix=`${basePrefix(user.userId,productId)}${kind}/`;
  const existing=await runtime().ARTWORK.list({prefix,limit:25,include:["customMetadata"]});
  if(kind!=="size-guide"&&!replace){const all=await runtime().ARTWORK.list({prefix:basePrefix(user.userId,productId),limit:30});const photoCount=all.objects.filter(object=>!object.key.endsWith("order.json")&&!object.key.includes("/size-guide/")).length;if(photoCount+files.length>20)return NextResponse.json({error:"Etsy allows up to 20 photos on one listing. Remove a photo before adding another."},{status:409})}
  const saved:string[]=[];
  try{for(const file of files){const key=`${prefix}${crypto.randomUUID()}-${safeName(file.name)}`;await runtime().ARTWORK.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type},customMetadata:{name:safeName(file.name)}});saved.push(key)}
    if(kind==="size-guide"||replace)await Promise.all(existing.objects.map(object=>runtime().ARTWORK.delete(object.key)));
  }catch(error){await Promise.all(saved.map(key=>runtime().ARTWORK.delete(key)));throw error}
  return NextResponse.json({ok:true,key:saved[0],keys:saved,names:files.map(file=>file.name)});
}

export async function DELETE(request:Request){
  const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to remove listing images."},{status:401});
  const url=new URL(request.url),productId=url.searchParams.get("productId")||"",kind=url.searchParams.get("kind")||"",key=url.searchParams.get("key")||"";if(!productId)return NextResponse.json({error:"Choose a listing."},{status:400});
  if(!await ownsDraft(user.userId,productId))return NextResponse.json({error:"That listing does not belong to this Listing Factory account."},{status:403});
  const ownedPrefix=basePrefix(user.userId,productId);
  if(key){if(!key.startsWith(ownedPrefix)||key.endsWith("order.json"))return NextResponse.json({error:"That listing image is not available."},{status:403});await runtime().ARTWORK.delete(key);const orderKey=`${ownedPrefix}order.json`,orderObject=await runtime().ARTWORK.get(orderKey);if(orderObject)try{const order=(JSON.parse(await orderObject.text()) as string[]).filter(id=>id!==`stored:${key}`);await runtime().ARTWORK.put(orderKey,JSON.stringify(order),{httpMetadata:{contentType:"application/json"}})}catch{}return NextResponse.json({ok:true})}
  const prefix=`etsy-listing-images/${user.userId}/${productId}/${kind==="mockup"?"mockup/":kind==="size-guide"?"size-guide/":kind==="upload"?"upload/":""}`;let cursor:string|undefined;
  do{const page=await runtime().ARTWORK.list({prefix,cursor,include:["customMetadata"]});await Promise.all(page.objects.map(object=>runtime().ARTWORK.delete(object.key)));cursor=page.truncated?page.cursor:undefined}while(cursor);
  return NextResponse.json({ok:true});
}
