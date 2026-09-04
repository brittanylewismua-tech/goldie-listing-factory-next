type ProductVariant={id:number;is_enabled?:boolean;is_default?:boolean;options?:number[]};
type Camera={id?:number;camera_id?:number;label?:string;position?:string;option_id?:number|null;variant_id?:number|null};
type CameraBlueprint={render_settings?:{cameras?:Camera[]};print_provider?:{options?:Array<{type?:string;items?:Array<{id:number}>}>}};

export type CameraMockup={src:string;variantIds:number[];position:string};

/* Printify's public product API only returns mockups it has already elected to
   publish (often one front view per colour). Its editor uses the blueprint's
   camera catalogue and this documented image-host URL shape to expose the rest.
   We use one representative enabled variant, just as the editor does when the
   seller changes camera angle, rather than multiplying every camera by every
   size. The ordinary API images remain available alongside these. */
const compatible=(camera:Camera,variant:ProductVariant)=>camera.variant_id!=null
  ?Number(camera.variant_id)===variant.id
  :camera.option_id!=null?(variant.options||[]).includes(Number(camera.option_id)):true;
const mockup=(productId:string,variantId:number,camera:Camera):CameraMockup[]=>{
  const id=Number(camera.camera_id||camera.id),label=String(camera.label||camera.position||"Printify mockup");
  if(!id)return [];
  const query=new URLSearchParams({s:"800",camera_label:label});
  return [{src:`https://images.printify.com/mockup/${productId}/${variantId}/${id}/?${query}`,variantIds:[variantId],position:String(camera.position||"")}];
};

export async function printifyMockupSet(input:{productId:string;blueprintId:number;providerId:number;variants:ProductVariant[]}):Promise<{cameraDetails:CameraMockup[];colorDetails:CameraMockup[]}>{
  const variant=input.variants.find(item=>item.is_enabled!==false&&item.is_default)
    ||input.variants.find(item=>item.is_enabled!==false)
    ||input.variants[0];
  if(!variant||!input.blueprintId||!input.providerId)return {cameraDetails:[],colorDetails:[]};
  try{
    const response=await fetch(`https://printify.com/designer-api/api/v2/blueprints/${input.blueprintId}/${input.providerId}?salesChannel=etsy`,{signal:AbortSignal.timeout(8000),headers:{"User-Agent":"Goldie-Listing-Factory"}});
    if(!response.ok)return {cameraDetails:[],colorDetails:[]};
    const blueprint=await response.json() as CameraBlueprint,cameras=blueprint.render_settings?.cameras||[];
    const cameraDetails=cameras.filter(camera=>compatible(camera,variant)).flatMap(camera=>mockup(input.productId,variant.id,camera));
    const defaultCamera=cameras.find(camera=>(camera as Camera&{is_default?:number}).is_default)||cameras[0];
    const colorIds=new Set((blueprint.print_provider?.options||[]).find(option=>/colou?r/i.test(option.type||""))?.items?.map(item=>item.id)||[]);
    const representatives=[...input.variants.reduce((found,item)=>{
      const color=(item.options||[]).find(option=>colorIds.has(option));
      if(color!=null&&!found.has(color))found.set(color,item);
      return found;
    },new Map<number,ProductVariant>()).values()];
    const colorDetails=defaultCamera?representatives.filter(item=>compatible(defaultCamera,item)).flatMap(item=>mockup(input.productId,item.id,defaultCamera)):[];
    return {cameraDetails,colorDetails};
  }catch{return {cameraDetails:[],colorDetails:[]}}
}

export async function printifyCameraMockups(input:{productId:string;blueprintId:number;providerId:number;variants:ProductVariant[]}):Promise<CameraMockup[]>{
  return (await printifyMockupSet(input)).cameraDetails;
}
