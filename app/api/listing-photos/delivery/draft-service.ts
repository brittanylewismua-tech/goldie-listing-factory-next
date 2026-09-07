import {DraftReviewRequired,draftStep,verifyDraft,type DraftSnapshot,type DraftState,type DraftView,type DraftOperation,type Question} from './draft-engine';
/** Etsy escapes text in API reads. Decode exactly one layer, preserving literal seller entities. */
export function decodeEtsyText(value:string){return String(value??'').replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,(match,key:string)=>{
 const names:Record<string,string>={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:'\u00a0'};
 if(key[0]!=='#')return names[key.toLowerCase()]||match;
 const code=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10);return code>0&&code<=0x10ffff?String.fromCodePoint(code):match;
})}
export type PrintifyDraftProduct={is_locked?:boolean;external?:{id?:string|number};variants?:{id:number;sku:string;price:number;is_enabled:boolean;options?:number[]}[];options?:{name:string;type?:string;values:{id:number;title:string}[]}[]};
type Request=(path:string,init?:RequestInit)=>Promise<Response>;
/** Verify the existing fulfillment identifiers; never rewrite inventory or SKUs in Etsy. */
export function verifyInventory(product:PrintifyDraftProduct,inventory:{products?:{sku:string;offerings:{price:{amount:number;divisor:number};is_enabled:boolean}[]}[]}){
 const expected=product.variants?.filter(v=>v.is_enabled),actual=inventory.products?.filter(p=>p.offerings?.some(o=>o.is_enabled));
 if(!expected?.length||!actual?.length||expected.length!==actual.length||new Set(expected.map(v=>v.sku)).size!==expected.length||new Set(actual.map(v=>v.sku)).size!==actual.length)throw new DraftReviewRequired('The Etsy draft variants do not match Printify. Review colors and sizes before finishing.');
 for(const v of expected){const row=actual.find(p=>p.sku===v.sku),offers=row?.offerings.filter(o=>o.is_enabled);if(!offers?.length||offers.some(o=>!o.price?.divisor||Math.round(o.price.amount/o.price.divisor*100)!==v.price))throw new DraftReviewRequired('An Etsy draft SKU or price differs from Printify. Review the variants before finishing.');}
}
export function draftWithSize(snapshot:DraftSnapshot,product:PrintifyDraftProduct):DraftSnapshot{
 const size=product.options?.find(o=>o.type==='size'||/^sizes?$/i.test(o.name)),selected=new Set(product.variants?.filter(v=>v.is_enabled).flatMap(v=>v.options||[]));
 const sizes=size?.values.filter(v=>selected.has(v.id));
 if(sizes?.length===1&&!snapshot.description.toLowerCase().includes(sizes[0].title.toLowerCase()))return {...snapshot,description:`${snapshot.description}\n\nAvailable size: ${sizes[0].title}.`};
 return snapshot;
}
export async function readDraft(request:Request,listingId:number,shopId:number,product:PrintifyDraftProduct):Promise<DraftView>{
 const listing=await (await request(`/listings/${listingId}`)).json() as {shop_id:number;state:string;title:string;description:string;tags:string[];taxonomy_id:number;shipping_profile_id:number};
 if(Number(listing.shop_id)!==shopId||listing.state!=='draft')throw new DraftReviewRequired('The linked listing must still be a draft in the original Etsy shop. Finishing stopped.');
 // Ownership/state is checked first. Settle every read before any caller may mutate or retry.
 const reads=await Promise.allSettled([
  request(`/listings/${listingId}/inventory`).then(response=>response.json()),
  request(`/shops/${shopId}/listings/${listingId}/properties`).then(response=>response.json()),
  request(`/listings/${listingId}/personalization`).then(response=>response.json()),
 ]);
 const failed=reads.find(result=>result.status==='rejected');if(failed?.status==='rejected')throw failed.reason;
 const [inventory,properties,personal]=reads.map(result=>(result as PromiseFulfilledResult<unknown>).value) as [Parameters<typeof verifyInventory>[1],{results?:DraftSnapshot['properties']},{personalization_questions?:Question[]}];
 verifyInventory(product,inventory);
 if(!Array.isArray(properties.results)||!Array.isArray(personal.personalization_questions))throw new DraftReviewRequired('Etsy returned incomplete draft details. Nothing further was changed.');
 return {shopId:Number(listing.shop_id),state:listing.state,basic:{title:decodeEtsyText(listing.title),description:decodeEtsyText(listing.description),tags:listing.tags.map(decodeEtsyText),taxonomy_id:Number(listing.taxonomy_id),shipping_profile_id:Number(listing.shipping_profile_id)},properties:properties.results.map(p=>({property_id:p.property_id,value_ids:p.value_ids||[],values:(p.values||[]).map(decodeEtsyText)})),questions:personal.personalization_questions.map(q=>({...q,question_text:decodeEtsyText(q.question_text),instructions:decodeEtsyText(q.instructions||''),options:q.options?.map(o=>({label:decodeEtsyText(o.label)}))}))};
}
export async function finishDraftMetadata(args:{request:Request;listingId:number;shopId:number;product:PrintifyDraftProduct;snapshot:DraftSnapshot;saved:DraftState|null;save:(s:DraftState)=>Promise<void>;backup:(v:DraftView)=>Promise<void>;verifyOnly?:boolean}){
 const {request,listingId,shopId,product,snapshot,saved,save,backup}=args;
 const read=()=>readDraft(request,listingId,shopId,product);
 if(args.verifyOnly){verifyDraft(await read(),shopId,snapshot);return {done:true}}
 const write=async(op:DraftOperation)=>{
  const check=await (await request(`/listings/${listingId}`)).json() as {shop_id:number;state:string};
  if(Number(check.shop_id)!==shopId||check.state!=='draft')throw new DraftReviewRequired('The Etsy listing changed shop or is no longer a draft. Finishing stopped.');
  const base=`/shops/${shopId}/listings/${listingId}`;
  if(op.key==='basic'){
   const value=op.value as DraftView['basic'];const body=new URLSearchParams({title:value.title,description:value.description,taxonomy_id:String(value.taxonomy_id),shipping_profile_id:String(value.shipping_profile_id)});
   body.set('tags',value.tags.join(','));
   await request(base,{method:'PATCH',body});
  }else if(op.key==='questions'){
   const questions=op.value as Question[];
   await request(`${base}/personalization?supports_multiple_personalization_questions=true`,questions.length?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({personalization_questions:questions})}:{method:'DELETE'});
  }else{
   const p=op.value as DraftSnapshot['properties'][number];
   const body=new URLSearchParams({value_ids:p.value_ids.join(','),values:p.values.join(',')});
   await request(`${base}/properties/${p.property_id}`,{method:'PUT',body});
  }
 };
 return draftStep({read,save,backup,write},shopId,listingId,snapshot,saved);
}
