import {draftVariantSku} from './draft-identity.ts';
type Variant={id:number;sku?:string;price:number;is_enabled:boolean};
type Product={external?:{id?:string|number};is_locked?:boolean;variants?:Variant[]};
/** Owner and exact creation key are established by the caller. Never publishes or creates. */
export async function prepareEtsySkus(shopId:number,productId:string,key:string,token:string,fetcher:typeof fetch=fetch){
 const exactKey=/^[a-f0-9]{64}$/.test(key);
 const url=`https://api.printify.com/v1/shops/${shopId}/products/${productId}.json`;
 const headers={Authorization:`Bearer ${token}`,'User-Agent':'Goldie-Listing-Factory'};
 const read=async()=>{const response=await fetcher(url,{headers,signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Printify could not check the listing SKUs. Try again before publishing.');return response.json() as Promise<Product>};
 const product=await read();
 if(Number(product.external?.id)>0)return; // Existing Etsy SKUs are seller-controlled.
 if(product.is_locked)throw Error('Printify is still processing this listing. Wait for it to finish, then try again.');
 if(!product.variants?.length)throw Error('Printify could not confirm the listing variants. Try again.');
 const variants=product.variants.map(v=>({id:v.id,price:v.price,is_enabled:v.is_enabled,sku:exactKey&&v.sku===`LF-${key.slice(0,32)}-${v.id}`?draftVariantSku(key,v.id):v.sku}));
 if(variants.some(v=>v.is_enabled&&(v.sku||'').length>32))throw Error('A custom SKU is longer than Etsy’s 32-character limit. Shorten it in Printify before publishing.');
 if(!variants.some((v,i)=>v.sku!==product.variants![i].sku))return;
 const response=await fetcher(url,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({variants}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Printify did not confirm the SKU update. Try again to recheck the saved listing before publishing.');
 await response.body?.cancel();
 const saved=await read(),actual=new Map(saved.variants?.map(v=>[v.id,v]));
 if(actual.size!==variants.length||variants.some(v=>{const a=actual.get(v.id);return !a||a.sku!==v.sku||a.price!==v.price||a.is_enabled!==v.is_enabled}))throw Error('The saved Printify variants need review. Reopen the listing before publishing.');
}
