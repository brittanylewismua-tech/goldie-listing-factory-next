import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { decryptPrintifyToken } from "../../token-crypto";
import { primaryImageForSide,replaceArtworkForVariants,type DraftPrintArea } from "../color-artwork";
import { printifyMockupSet } from "@/app/printify-camera-mockups";

type ArtworkUpdate={stagedId?:string;fileName?:string;position:string;variantIds:number[];colorId:number;colorTitle:string;reset?:boolean;bounds?:{left:number;top:number;right:number;bottom:number};maxPlacementScale?:number};
async function artworkContents(stream?:ReadableStream){if(!stream)throw new Error("Goldie could not read the staged artwork.");const bytes=new Uint8Array(await new Response(stream).arrayBuffer());let binary="";for(let index=0;index<bytes.length;index+=0x8000)binary+=String.fromCharCode(...bytes.subarray(index,index+0x8000));return btoa(binary)}

export async function PATCH(request:Request){
  const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to update this draft."},{status:401});
  const body=await request.json() as {productId?:string;title?:string;tags?:string[];description?:string;etsyDetails?:unknown;placement?:{x:number;y:number;scale:number};variantPrices?:Record<string,number>;selectedVariantIds?:number[];artworkUpdate?:ArtworkUpdate;refreshImages?:boolean},productId=String(body.productId||"");
  const owned=await env.DB.prepare("SELECT response_json FROM printify_draft_results WHERE user_id=? AND status='succeeded' AND json_extract(response_json,'$.id')=? LIMIT 1").bind(user.userId,productId).first<{response_json:string}>();
  if(!owned)return NextResponse.json({error:"That Printify draft was not created by this Listing Factory account."},{status:404});
  const draft=JSON.parse(owned.response_json) as {shopId:number;batchId?:string;blueprintId?:number;providerId?:number;primaryArtworkAreas?:Record<string,DraftPrintArea[]>;primaryArtworkImageIds?:Record<string,string>;artworkOverrides?:Record<string,{name:string;position:string}>;artworkOverridePreviewUrls?:Record<string,string>},connection=await env.DB.prepare("SELECT encrypted_token FROM printify_connections WHERE user_id=?").bind(user.userId).first<{encrypted_token:string}>(),secret=(env as unknown as {PRINTIFY_TOKEN_KEY?:string}).PRINTIFY_TOKEN_KEY;
  if(!connection||!secret)return NextResponse.json({error:"Reconnect Printify to update this draft."},{status:401});
  const token=await decryptPrintifyToken(connection.encrypted_token,secret),url=`https://api.printify.com/v1/shops/${draft.shopId}/products/${productId}.json`;
  let placementPayload:unknown;
  let placementScale:number|undefined;
  let currentProduct:{variants?:Array<{id:number;cost?:number;price?:number;is_enabled?:boolean;is_default?:boolean;options?:number[]}>;images?:Array<{src?:string;is_default?:boolean;variant_ids?:number[];position?:string}>;print_areas?:Array<{variant_ids:number[];background?:string;placeholders?:Array<{position:string;images?:Array<{id?:string;x?:number;y?:number;scale?:number;angle?:number}>}>}>}|undefined;
  if(body.placement||body.variantPrices||body.artworkUpdate||body.refreshImages){
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
  if(body.selectedVariantIds&&!currentProduct){
    const currentResponse=await fetch(url,{headers:{Authorization:`Bearer ${token}`,"User-Agent":"Goldie-Listing-Factory"}});
    if(!currentResponse.ok)return NextResponse.json({error:`Printify could not load this draft (${currentResponse.status}).`},{status:currentResponse.status});
    currentProduct=await currentResponse.json() as typeof currentProduct;
  }
  const updateBody:Record<string,unknown>={};
  if(body.title!==undefined)updateBody.title=String(body.title||"").slice(0,255);
  if(body.description!==undefined)updateBody.description=String(body.description||"");
  if(body.tags!==undefined)updateBody.tags=(body.tags||[]).slice(0,13);
  if(placementPayload)updateBody.print_areas=placementPayload;
  let primaryArtworkId:string|undefined,overridePreviewUrl:string|undefined;
  if(body.artworkUpdate){
    const change=body.artworkUpdate,areas=(currentProduct?.print_areas||[]) as DraftPrintArea[];
    if(!change.position||!change.variantIds?.length)return NextResponse.json({error:"Choose a product color before changing its artwork."},{status:400});
    primaryArtworkId=draft.primaryArtworkImageIds?.[change.position]||primaryImageForSide(areas,change.position);
    if(!primaryArtworkId)return NextResponse.json({error:`Goldie could not identify the main ${change.position} artwork in this draft.`},{status:409});
    let imageId=primaryArtworkId;
    if(!change.reset){
      const runtime=env as unknown as {ARTWORK?:{get(key:string):Promise<{body?:ReadableStream;customMetadata?:Record<string,string>}|null>}};
      const staged=change.stagedId?await runtime.ARTWORK?.get(change.stagedId):null;
      if(!staged||staged.customMetadata?.owner!==user.userId||Number(staged.customMetadata?.expires||0)<=Date.now())return NextResponse.json({error:"That artwork upload expired. Choose the file again."},{status:400});
      const upload=await fetch("https://api.printify.com/v1/uploads/images.json",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","User-Agent":"Goldie-Listing-Factory"},body:JSON.stringify({file_name:String(change.fileName||"alternate-artwork.png"),contents:await artworkContents(staged.body)})});
      if(!upload.ok)return NextResponse.json({error:`Printify could not upload that artwork (${upload.status}).`},{status:upload.status});
      const uploaded=await upload.json() as {id?:string;preview_url?:string};
      imageId=String(uploaded.id||"");overridePreviewUrl=uploaded.preview_url;
      if(!imageId)return NextResponse.json({error:"Printify did not return an image ID for that artwork."},{status:502});
    }
    const originalAreas=draft.primaryArtworkAreas?.[change.position]||areas;
    updateBody.print_areas=replaceArtworkForVariants(areas,change.position,change.variantIds,imageId,change.bounds,change.maxPlacementScale,primaryArtworkId,originalAreas);
    draft.primaryArtworkAreas={...(draft.primaryArtworkAreas||{}),[change.position]:originalAreas};
  }
  if(body.variantPrices){
    const variants=currentProduct?.variants||[];
    if(!variants.length)return NextResponse.json({error:"Printify did not return the actual variant costs, so Goldie will not approve these prices."},{status:409});
    const invalid=variants.find(variant=>{const price=Number(body.variantPrices?.[String(variant.id)]??variant.price),cost=Number(variant.cost);return !Number.isFinite(cost)||!Number.isInteger(price)||price<cost||price>1000000});
    if(invalid)return NextResponse.json({error:`The price for variant ${invalid.id} must be at least its current Printify cost.`},{status:400});
    const proposed=variants.map(variant=>({id:variant.id,price:Number(body.variantPrices?.[String(variant.id)]??variant.price),is_enabled:variant.is_enabled!==false}));
    updateBody.variants=proposed;
  }
  if(body.selectedVariantIds){
    const chosen=new Set(body.selectedVariantIds.map(Number));
    const variants=currentProduct?.variants||[];
    if(!variants.length)return NextResponse.json({error:"Printify did not return the variants for this draft."},{status:409});
    if(!variants.some(variant=>chosen.has(variant.id)))return NextResponse.json({error:"Choose at least one available color and size combination."},{status:400});
    updateBody.variants=variants.map(variant=>({id:variant.id,price:Number(body.variantPrices?.[String(variant.id)]??variant.price),is_enabled:chosen.has(variant.id)}));
  }
  const response=Object.keys(updateBody).length?await fetch(url,{method:"PUT",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json","User-Agent":"Goldie-Listing-Factory"},body:JSON.stringify(updateBody)}):null;
  if(response&&!response.ok){
    const detail=(await response.text().catch(()=>"")).replace(/[<>]/g,"").trim().slice(0,300);
    return NextResponse.json({error:`Printify could not update this draft (${response.status})${detail?`: ${detail}`:"."}`},{status:response.status});
  }
  const updated=response?await response.json().catch(()=>({})) as {images?:Array<{src?:string;is_default?:boolean;variant_ids?:number[];position?:string}>}:currentProduct||{};
  /* Enabling a colour asks Printify to generate mockups it did not need for the
     original template. The PUT can finish before those images are attached, so
     read the product back instead of making the seller reload and hope. */
  let refreshed=updated;
  /* Variant selection itself must be instant. Printify generates replacement
     mockups asynchronously; waiting through the mockup polling ladder made
     every color click block for several seconds. Artwork replacement still
     waits because that operation cannot be represented honestly until its new
     image is attached. */
  if(body.artworkUpdate){
    const newlyEnabled=new Set((body.selectedVariantIds||body.artworkUpdate?.variantIds||[]).filter(id=>!(currentProduct?.variants||[]).some(variant=>variant.id===id&&variant.is_enabled!==false)));
    for(const wait of [0,900,1800]){
      if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
      const read=await fetch(url,{headers:{Authorization:`Bearer ${token}`,"User-Agent":"Goldie-Listing-Factory"}});
      if(!read.ok)continue;
      refreshed=await read.json() as typeof updated;
      const pictured=new Set((refreshed.images||[]).flatMap(image=>image.variant_ids||[]));
      if(!newlyEnabled.size||[...newlyEnabled].some(id=>pictured.has(id)))break;
    }
  }
  const images=refreshed.images||updated.images||currentProduct?.images;
  let blueprintId=Number(draft.blueprintId||0),providerId=Number(draft.providerId||0);
  if(body.refreshImages&&(!blueprintId||!providerId)&&draft.batchId){
    const session=await env.DB.prepare("SELECT template_json FROM printify_batch_sessions WHERE id=? AND user_id=? LIMIT 1").bind(draft.batchId,user.userId).first<{template_json:string}>();
    if(session?.template_json)try{const template=JSON.parse(session.template_json) as {blueprint_id?:number;print_provider_id?:number};blueprintId=Number(template.blueprint_id||0);providerId=Number(template.print_provider_id||0)}catch{}
  }
  const generated=body.refreshImages&&currentProduct?await printifyMockupSet({productId,blueprintId,providerId,variants:currentProduct.variants||[]}):{cameraDetails:[],colorDetails:[]},cameraDetails=generated.cameraDetails;
  const apiDetails=(images||[]).filter(image=>image.src).map(image=>({src:image.src!,variantIds:image.variant_ids||[],position:image.position||""}));
  const allDetails=[...cameraDetails,...apiDetails].filter((image,index,list)=>list.findIndex(item=>item.src===image.src)===index);
  const nextOverrides={...(draft.artworkOverrides||{})};
  if(body.artworkUpdate){if(body.artworkUpdate.reset)delete nextOverrides[String(body.artworkUpdate.colorId)];else nextOverrides[String(body.artworkUpdate.colorId)]={name:String(body.artworkUpdate.fileName||"Alternate artwork"),position:body.artworkUpdate.position};}
  const nextOverridePreviews={...(draft.artworkOverridePreviewUrls||{})};
  if(body.artworkUpdate){if(body.artworkUpdate.reset)delete nextOverridePreviews[String(body.artworkUpdate.colorId)];else if(overridePreviewUrl)nextOverridePreviews[String(body.artworkUpdate.colorId)]=overridePreviewUrl;}
  const stored={...draft,...(blueprintId&&providerId?{blueprintId,providerId}:{}),artworkOverrides:nextOverrides,artworkOverridePreviewUrls:nextOverridePreviews,...(body.artworkUpdate&&primaryArtworkId?{primaryArtworkImageIds:{...(draft.primaryArtworkImageIds||{}),[body.artworkUpdate.position]:primaryArtworkId}}:{}),...(body.title!==undefined?{title:String(body.title||"").slice(0,255)}:{}),...(body.tags!==undefined?{tags:(body.tags||[]).slice(0,13)}:{}),...(body.description!==undefined?{description:String(body.description||"")}:{}) ,...(body.etsyDetails!==undefined?{etsyDetails:body.etsyDetails||null}:{}),...(body.placement?{placement:body.placement,placementScale}:{}),...(body.selectedVariantIds?{selectedVariantIds:body.selectedVariantIds,costReview:{...(draft as {costReview?:Record<string,unknown>}).costReview,approved:false,variants:(currentProduct?.variants||[]).map(variant=>({...variant,cost:Number(variant.cost),price:Number(variant.price),isEnabled:body.selectedVariantIds!.includes(variant.id)}))}}:{}),...(body.variantPrices?{costReview:{...(draft as {costReview?:Record<string,unknown>}).costReview,verified:true,approved:true,variants:(currentProduct?.variants||[]).map(variant=>({...variant,cost:Number(variant.cost),price:Number(body.variantPrices?.[String(variant.id)]??variant.price),isEnabled:body.selectedVariantIds?body.selectedVariantIds.includes(variant.id):variant.is_enabled!==false}))}}:{}),...(generated.colorDetails.length?{colorPreviewImageDetails:generated.colorDetails}:{}),...(allDetails.length?{printifyImages:allDetails.map(image=>image.src),printifyImageDetails:allDetails,previewUrl:images?.find(image=>image.is_default)?.src||images?.[0]?.src||allDetails[0]?.src}: {})};
  await env.DB.prepare("UPDATE printify_draft_results SET response_json=? WHERE user_id=? AND status='succeeded' AND json_extract(response_json,'$.id')=?").bind(JSON.stringify(stored),user.userId,productId).run();
  return NextResponse.json({ok:true,draft:stored});
}
