type ProductVariant={id:number;is_enabled?:boolean;is_default?:boolean;options?:number[]};
type Camera={id?:number;camera_id?:number;label?:string;position?:string;option_id?:number|null;variant_id?:number|null};
type CameraBlueprint={render_settings?:{cameras?:Camera[]}};

export type CameraMockup={src:string;variantIds:number[];position:string};

/* Printify's public product API only returns mockups it has already elected to
   publish (often one front view per colour). Its editor uses the blueprint's
   camera catalogue and this documented image-host URL shape to expose the rest.
   We use one representative enabled variant, just as the editor does when the
   seller changes camera angle, rather than multiplying every camera by every
   size. The ordinary API images remain available alongside these. */
export async function printifyCameraMockups(input:{productId:string;blueprintId:number;providerId:number;variants:ProductVariant[]}):Promise<CameraMockup[]>{
  const variant=input.variants.find(item=>item.is_enabled!==false&&item.is_default)
    ||input.variants.find(item=>item.is_enabled!==false)
    ||input.variants[0];
  if(!variant||!input.blueprintId||!input.providerId)return [];
  try{
    const response=await fetch(`https://printify.com/designer-api/api/v2/blueprints/${input.blueprintId}/${input.providerId}?salesChannel=etsy`,{signal:AbortSignal.timeout(8000),headers:{"User-Agent":"Goldie-Listing-Factory"}});
    if(!response.ok)return [];
    const blueprint=await response.json() as CameraBlueprint,options=new Set(variant.options||[]);
    return (blueprint.render_settings?.cameras||[]).filter(camera=>{
      if(camera.variant_id!=null)return Number(camera.variant_id)===variant.id;
      if(camera.option_id!=null)return options.has(Number(camera.option_id));
      return true;
    }).flatMap(camera=>{
      const id=Number(camera.camera_id||camera.id),label=String(camera.label||camera.position||"Printify mockup");
      if(!id)return [];
      const query=new URLSearchParams({s:"800",camera_label:label});
      return [{src:`https://images.printify.com/mockup/${input.productId}/${variant.id}/${id}/?${query}`,variantIds:[variant.id],position:String(camera.position||"")}];
    });
  }catch{return []}
}
