import {belongsToCreation} from './draft-identity.ts';
type Product={id:string;shop_id?:number;blueprint_id?:number;print_provider_id?:number;variants?:Array<{id:number;sku?:string}>};
/** Read only. An absent/incomplete match is never permission to replay a POST. */
export async function reconcileDraftJob<T extends Product>(expected:Parameters<typeof belongsToCreation>[1],token:string,fetcher:typeof fetch=fetch):Promise<T|null>{
  let match:T|null=null;
  for(let page=1;page<=10;page++){
    const response=await fetcher(`https://api.printify.com/v1/shops/${expected.shopId}/products.json?limit=50&page=${page}`,{signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,'User-Agent':'Goldie-Listing-Factory'}});
    if(!response.ok){await response.body?.cancel();return null;}
    const result=await response.json() as {data?:T[];current_page?:number;last_page?:number};
    if(!Array.isArray(result.data))return null;
    for(const product of result.data){if(belongsToCreation(product,expected)){if(match&&match.id!==product.id)throw Error('Multiple drafts matched one creation identity; manual review is required.');match=product;}}
    if(result.data.length<50||(Number.isInteger(result.last_page)&&page>=Number(result.last_page)))return match;
  }
  // We did not finish scanning: do not claim uniqueness or create a replacement.
  return null;
}
