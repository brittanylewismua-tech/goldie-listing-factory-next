import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { decryptPrintifyToken } from "../../token-crypto";

export async function PATCH(request:Request){
  const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to update this draft."},{status:401});
  const body=await request.json() as {productId?:string;title?:string;tags?:string[];description?:string;etsyDetails?:unknown;placement?:{x:number;y:number;scale:number};variantPrices?:Record<string,number>},productId=String(body.productId||"");
  const owned=await env.DB.prepare("SELECT response_json FROM printify_draft_results WHERE user_id=? AND status='succeeded' AND json_extract(response_json,'$.id')=? LIMIT 1").bind(user.userId,productId).first<{response_json:string}>();
  if(!owned)return NextResponse.json({error:"That Printify draft was not created by this Listing Factory account."},{status:404});
  const draft=JSON.parse(owned.response_json) as {shopId:number},connection=await env.DB.prepare("SELECT encrypted_token FROM printify_connections WHERE user_id=?").bind(user.userId).first<{encrypted_token:string}>(),secret=(env as unknown as {PRINTIFY_TOKEN_KEY?:string}).PRINTIFY_TOKEN_KEY;
  if(!connection||!secret)return NextResponse.json({error:"Reconnect Printify to update this draft."},{status:401});
  const token=await decryptPrintifyToken(connection.encrypted_token,secret),url=`https://api.printify.com/v1/shops/${draft.shopId}/products/${productId}.json`;
  let placementPayload:unknown;
  let placementScale:number|undefined;
  let currentProduct:{variants?:Array<{id:number;cost?:number;price?:number;is_enabled?:boolean}>;print_areas?:Array<{variant_ids:number[];background?:string;placeholders?:Array<{position:string;images?:Array<{id?:string;x?:number;y?:number;scale?:number;angle?:number}>}>}>}|undefined;
  if(body.placement||body.variantPrices){
    const currentResponse=await fetch(url,{headers:{Authorization:`Bearer ${token}`,"User-Agent":"Goldie-Listing-Factory"}});
    if(!currentResponse.ok)return NextResponse.json({error:`Printify could not load this draft (${currentResponse.status}).`},{status:currentResponse.status});
    const current=await currentResponse.json() as typeof currentProduct;
    currentProduct=current;
    /* D882 · This block is entered for a placement change OR a price approval,
       but everything below dereferences body.placement. Approving finished
       prices sends variantPrices and no placement, so the non-null assertions
       threw and the worker returned a bodiless 500 - which is why the finished
       cost gate could never be released. Only rebuild print areas when a
       placement actually came in; the fetch above is still needed either way,
       because the price check reads currentProduct.variants. */
    if(body.placement)placementPayload=(current.print_areas||[]).map(area=>({
      variant_ids:area.variant_ids,
      ...(area.background?{background:area.background}:{}),
      placeholders:(area.placeholders||[]).filter(placeholder=>placeholder.images?.some(image=>image.id)).map(placeholder=>({
        position:placeholder.position,
        images:(placeholder.images||[]).filter(image=>image.id).map(image=>{
          const scale=Math.max(.05,Math.min(3,Number(image.scale??1)*body.placement!.scale));
          placementScale=Math.max(placementScale??0,scale);
          return {id:image.id,x:Math.max(0,Math.min(1,Number(image.x??.5)+body.placement!.x)),y:Math.max(0,Math.min(1,Number(image.y??.5)+body.placement!.y)),scale,angle:Number(image.angle??0)};
        }),
      })),
    }));
  }
  const updateBody:Record<string,unknown>={};
  if(body.title!==undefined)updateBody.title=String(body.title||"").slice(0,255);
  if(body.description!==undefined)updateBody.description=String(body.description||"");
  if(body.tags!==undefined)updateBody.tags=(body.tags||[]).slice(0,13);
  if(placementPayload)updateBody.print_areas=placementPayload;
  if(body.variantPrices){
    const variants=currentProduct?.variants||[];
    if(!variants.length)return NextResponse.json({error:"Printify did not return the actual variant costs, so Goldie will not approve these prices."},{status:409});
    const invalid=variants.find(variant=>{const price=Number(body.variantPrices?.[String(variant.id)]??variant.price),cost=Number(variant.cost);return !Number.isFinite(cost)||!Number.isInteger(price)||price<cost||price>1000000});
    if(invalid)return NextResponse.json({error:`The price for variant ${invalid.id} must be at least its current Printify cost.`},{status:400});
    const proposed=variants.map(variant=>({id:variant.id,price:Number(body.variantPrices?.[String(variant.id)]??variant.price),is_enabled:variant.is_enabled!==false}));
    updateBody.variants=proposed;
  }
  const response=await fetch(url,{method:"PUT",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","User-Agent":"Goldie-Listing-Factory"},body:JSON.stringify(updateBody)});
  if(!response.ok){
    const detail=(await response.text().catch(()=>"")).replace(/[<>]/g,"").trim().slice(0,300);
    return NextResponse.json({error:`Printify could not update this draft (${response.status})${detail?`: ${detail}`:"."}`},{status:response.status});
  }
  const updated=await response.json().catch(()=>({})) as {images?:Array<{src?:string;is_default?:boolean}>};
  const stored={...draft,...(body.title!==undefined?{title:String(body.title||"").slice(0,255)}:{}),...(body.tags!==undefined?{tags:(body.tags||[]).slice(0,13)}:{}),...(body.description!==undefined?{description:String(body.description||"")}:{}) ,...(body.etsyDetails!==undefined?{etsyDetails:body.etsyDetails||null}:{}),...(body.placement?{placement:body.placement,placementScale}:{}),...(body.variantPrices?{costReview:{...(draft as {costReview?:Record<string,unknown>}).costReview,verified:true,approved:true,variants:(currentProduct?.variants||[]).map(variant=>({...variant,cost:Number(variant.cost),price:Number(body.variantPrices?.[String(variant.id)]??variant.price),isEnabled:variant.is_enabled!==false}))}}:{}),...(updated.images?{printifyImages:updated.images.map(image=>image.src).filter(Boolean),previewUrl:updated.images.find(image=>image.is_default)?.src||updated.images[0]?.src}: {})};
  await env.DB.prepare("UPDATE printify_draft_results SET response_json=? WHERE user_id=? AND status='succeeded' AND json_extract(response_json,'$.id')=?").bind(JSON.stringify(stored),user.userId,productId).run();
  return NextResponse.json({ok:true,draft:stored});
}
