/** A renewed template session must not give the same requested draft a new
 * identity. SKU is a supported Printify creation field, unlike external.id,
 * which belongs to the sales channel. It lets recovery find the exact job even
 * if Printify deduplicates identical uploaded artwork into one image ID. */
export async function draftCreationKey(owner:string,shopId:number,templateId:string,clientId:string){
  if(!owner||!Number.isSafeInteger(shopId)||shopId<=0||!templateId||!clientId)throw Error('An owned template and design are required.');
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([owner,shopId,templateId,clientId])));
  return Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,'0')).join('');
}
export function draftVariantSku(key:string,variantId:number){
  if(!/^[a-f0-9]{64}$/.test(key)||!Number.isSafeInteger(variantId)||variantId<=0)throw Error('Invalid draft variant identity.');
  return `LF-${key.slice(0,32)}-${variantId}`;
}
export function belongsToCreation(product:{shop_id?:number;blueprint_id?:number;print_provider_id?:number;variants?:Array<{id:number;sku?:string}>},expected:{key:string;shopId:number;blueprintId:number;providerId:number;variantIds:number[]}){
  if(product.shop_id!==expected.shopId||product.blueprint_id!==expected.blueprintId||product.print_provider_id!==expected.providerId||!expected.variantIds.length)return false;
  const variants=new Map((product.variants||[]).map(variant=>[variant.id,variant.sku]));
  return expected.variantIds.every(id=>variants.get(id)===draftVariantSku(expected.key,id));
}
