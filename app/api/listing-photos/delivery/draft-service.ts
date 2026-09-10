import {DraftReviewRequired,draftStep,verifyDraft,type DraftSnapshot,type DraftState,type DraftView,type DraftOperation,type Question} from './draft-engine';
import {inventoryPrerequisite} from './prerequisites';
/** Etsy escapes text in API reads. Decode exactly one layer, preserving literal seller entities. */
export function decodeEtsyText(value:string){return String(value??'').replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,(match,key:string)=>{
 const names:Record<string,string>={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:'\u00a0'};
 if(key[0]!=='#')return names[key.toLowerCase()]||match;
 const code=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10);return code>0&&code<=0x10ffff?String.fromCodePoint(code):match;
})}
export type PrintifyDraftProduct={is_locked?:boolean;external?:{id?:string|number};variants?:{id:number;sku:string;price:number;is_enabled:boolean;options?:number[]}[];options?:{name:string;type?:string;values:{id:number;title:string}[]}[]};
type EtsyPropertyValue={property_id:number;property_name:string;scale_id?:number|null;value_ids?:number[];values?:string[];[key:string]:unknown};
type EtsyOffering={price:{amount:number;divisor:number};is_enabled:boolean;quantity?:number;readiness_state_id?:number|null;[key:string]:unknown};
export type EtsyInventory={products?:{sku:string;property_values?:EtsyPropertyValue[];offerings:EtsyOffering[];[key:string]:unknown}[];price_on_property?:number[];quantity_on_property?:number[];sku_on_property?:number[];readiness_state_on_property?:number[];[key:string]:unknown};
type Request=(path:string,init?:RequestInit)=>Promise<Response>;
function visibleVariantKey(product:PrintifyDraftProduct,variant:NonNullable<PrintifyDraftProduct['variants']>[number]){
 const ids=new Set(variant.options||[]),parts=[];
 for(const option of product.options||[]){const matches=option.values.filter(value=>ids.has(value.id));if(matches.length!==1)return null;parts.push(`${option.name.trim().toLowerCase()}:${matches[0].title.trim().toLowerCase()}`)}
 return parts.length?parts.sort().join('\u0000'):null;
}
/** Verify the existing fulfillment identifiers; never rewrite inventory or SKUs in Etsy. */
export function verifyInventory(product:PrintifyDraftProduct,inventory:EtsyInventory){
 const expected=product.variants?.filter(v=>v.is_enabled),actual=inventory.products?.filter(p=>p.offerings?.some(o=>o.is_enabled));
 if(!expected?.length||!actual?.length||new Set(expected.map(v=>v.sku)).size!==expected.length||new Set(actual.map(v=>v.sku)).size!==actual.length)throw new DraftReviewRequired('The Etsy draft variants do not match Printify. Review colors and sizes before finishing.');
 const expectedBySku=new Map(expected.map(variant=>[variant.sku,variant])),keys=expected.map(variant=>visibleVariantKey(product,variant)),canCompareVisible=keys.every((key):key is string=>Boolean(key));
 const expectedVisible=canCompareVisible?new Set(keys):null,actualVariants=actual.map(row=>expectedBySku.get(row.sku)),visiblePrices=new Map<string,number>();
 const conflictingVisiblePrice=canCompareVisible&&expected.some((variant,index)=>{const key=keys[index]!,price=visiblePrices.get(key);visiblePrices.set(key,variant.price);return price!==undefined&&price!==variant.price});
 if(actualVariants.some(variant=>!variant)||conflictingVisiblePrice||actual.length!==(expectedVisible?.size??expected.length)||expectedVisible&&new Set(actualVariants.map(variant=>visibleVariantKey(product,variant!))).size!==expectedVisible.size)throw new DraftReviewRequired('The Etsy draft variants do not match Printify. Review colors and sizes before finishing.');
 for(const [index,row] of actual.entries()){const variant=actualVariants[index]!,offers=row.offerings.filter(o=>o.is_enabled);if(!offers.length||offers.some(o=>!o.price?.divisor||Math.round(o.price.amount/o.price.divisor*100)!==variant.price))throw new DraftReviewRequired('An Etsy draft SKU or price differs from Printify. Review the variants before finishing.');}
 const prerequisite=inventoryPrerequisite(actual.flatMap(p=>p.offerings));if(prerequisite)throw new DraftReviewRequired(prerequisite);
}
/** Build Etsy's exact buyer-visible inventory from rows Etsy has already issued.
 * The baseline is an immutable pre-edit inventory backup. It lets a later saved
 * choice restore White after an earlier correction removed it, without inventing
 * property rows, SKUs, quantities, or variants. Unknown live rows always stop the
 * update so a seller's manual Etsy variation cannot be deleted silently. */
export function synchronizedInventory(product:PrintifyDraftProduct,inventory:EtsyInventory,baseline:EtsyInventory=inventory){
 const variants=product.variants||[],allBySku=new Map(variants.map(variant=>[variant.sku,variant])),expected=variants.filter(variant=>variant.is_enabled);
 const expectedByKey=new Map<string,typeof expected>();
 for(const variant of expected){const key=visibleVariantKey(product,variant);if(!key)return null;const group=expectedByKey.get(key)||[];group.push(variant);expectedByKey.set(key,group)}
 if(!expectedByKey.size||[...expectedByKey.values()].some(group=>new Set(group.map(variant=>variant.price)).size!==1))return null;
 const enabledLive=(inventory.products||[]).filter(row=>row.offerings?.some(offer=>offer.is_enabled));
 if(enabledLive.some(row=>!allBySku.has(row.sku)))return null;
 const sources=[...(inventory.products||[]),...(baseline.products||[])],products=[] as NonNullable<EtsyInventory['products']>;
 for(const [key,group] of expectedByKey){
  const expectedSkus=new Set(group.map(variant=>variant.sku));
  const row=sources.find(candidate=>expectedSkus.has(candidate.sku)&&candidate.offerings?.length&&visibleVariantKey(product,allBySku.get(candidate.sku)!)===key);
  const variant=row&&allBySku.get(row.sku);if(!row||!variant||row.offerings.some(offer=>!Number.isSafeInteger(offer.quantity)))return null;
  products.push({...row,offerings:row.offerings.map(offer=>({...offer,price:{amount:variant.price,divisor:100},is_enabled:true}))});
 }
 if(new Set(products.map(row=>row.sku)).size!==products.length)return null;
 const candidate={...inventory,products};
 try{verifyInventory(product,candidate);return candidate}catch{return null}
}
/** Kept as a compatibility name for callers and older saved jobs. */
export const narrowedInventory=(product:PrintifyDraftProduct,inventory:EtsyInventory)=>synchronizedInventory(product,inventory,inventory);
export function inventoryUpdateBody(inventory:EtsyInventory){return {
 products:(inventory.products||[]).map(product=>({sku:product.sku,property_values:(product.property_values||[]).map(value=>({property_id:value.property_id,property_name:value.property_name,scale_id:value.scale_id??null,value_ids:value.value_ids||[],values:value.values||[]})),offerings:product.offerings.map(offer=>({price:offer.price.amount/offer.price.divisor,quantity:offer.quantity!,is_enabled:offer.is_enabled,...(offer.readiness_state_id!=null?{readiness_state_id:offer.readiness_state_id}:{})}))})),
 price_on_property:inventory.price_on_property||[],quantity_on_property:inventory.quantity_on_property||[],sku_on_property:inventory.sku_on_property||[],...(inventory.readiness_state_on_property?{readiness_state_on_property:inventory.readiness_state_on_property}:{})
}}
export async function synchronizeNarrowedInventory(request:Request,listingId:number,shopId:number,product:PrintifyDraftProduct,snapshot:DraftSnapshot,backup:(inventory:EtsyInventory)=>Promise<void>,restore?:()=>Promise<EtsyInventory|null>){
 if(!snapshot.selected_variant_ids?.length)return false;
 const liveIds=(product.variants||[]).filter(variant=>variant.is_enabled).map(variant=>variant.id).sort((a,b)=>a-b);
 if(JSON.stringify(liveIds)!==JSON.stringify(snapshot.selected_variant_ids))throw new DraftReviewRequired('The saved colors or sizes changed after this Etsy draft was prepared. Return to Review and save the current choices again.');
 const listing=await (await request(`/listings/${listingId}`)).json() as {shop_id:number;state:string};
 if(Number(listing.shop_id)!==shopId||listing.state!=='draft')throw new DraftReviewRequired('The linked listing must still be a draft in the original Etsy shop. Inventory was not changed.');
 const inventory=await (await request(`/listings/${listingId}/inventory`)).json() as EtsyInventory;
 try{verifyInventory(product,inventory);return false}catch(error){
  const baseline=await restore?.()||inventory,corrected=synchronizedInventory(product,inventory,baseline);
  if(!corrected)throw error;
  await backup(inventory);
  await request(`/listings/${listingId}/inventory`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(inventoryUpdateBody(corrected))});
  const confirmed=await (await request(`/listings/${listingId}/inventory`)).json() as EtsyInventory;
  verifyInventory(product,confirmed);return true;
 }
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
