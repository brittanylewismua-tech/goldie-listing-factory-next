export type PrintifyPublishState=
  | {state:"published";listingId:number}
  | {state:"unpublished"}
  | {state:"unknown";reason:string};

type FetchLike=(input:string,init?:RequestInit)=>Promise<Response>;

/* Publishing costs money. A failed status read is not evidence that a product
   is unpublished, so this deliberately returns a third, blocking state rather
   than folding an upstream failure into `listingId = 0`. */
export async function readPrintifyPublishState(fetcher:FetchLike,token:string,shopId:number,productId:string):Promise<PrintifyPublishState>{
  let response:Response;
  try{
    response=await fetcher(`https://api.printify.com/v1/shops/${shopId}/products/${productId}.json`,{headers:{Authorization:`Bearer ${token}`,"User-Agent":"Goldie-Listing-Factory"}});
  }catch{
    return {state:"unknown",reason:"Printify could not be reached."};
  }
  if(!response.ok)return {state:"unknown",reason:`Printify could not confirm this product's publishing status (${response.status}).`};
  try{
    const product=await response.json() as {external?:{id?:string|number}};
    const listingId=Number(product.external?.id)||0;
    return listingId>0?{state:"published",listingId}:{state:"unpublished"};
  }catch{
    return {state:"unknown",reason:"Printify returned an unreadable publishing status."};
  }
}
