/* D641 · D639 compared the Printify store's title with the connected Etsy shop
   name. Brittany's own account broke it within the hour: her Printify store is
   still called HOWDYANGEL, the Etsy shop it publishes to was renamed to
   godisagirlapparel, and they are the SAME shop. So Goldie refused a setup that
   was entirely correct - a check that blocks good sellers is worse than no
   check, and a rename is a completely ordinary thing to do.

   Names are not identity. The only authoritative question is whether the Etsy
   listings this Printify store creates land in the Etsy shop Goldie holds a
   token for, and that can be asked directly: take a product this store has
   already published, which carries the Etsy listing id in external.id, and ask
   Etsy for that listing WITHIN the connected shop. Etsy answers 200 only if the
   listing belongs to that shop.

   The three outcomes are deliberately not two:
     matched    - proven same shop, whatever either side is called
     mismatched - Etsy denies the listing belongs to the connected shop
     unknown    - nothing published yet, or the check could not complete

   Only `mismatched` blocks. `unknown` is not evidence, and Goldie does not stop
   a seller on the strength of something it could not establish. */
export type ShopPairing="matched"|"mismatched"|"unknown";

type PrintifyProduct={external?:{id?:string}};

export async function verifyShopPairing(options:{
  printifyToken:string;
  printifyShopId:number;
  etsyShopId:number;
  etsyToken:string;
  etsyFetch:<T>(path:string,token:string)=>Promise<T>;
}):Promise<{result:ShopPairing;listingId?:number}>{
  const {printifyToken,printifyShopId,etsyShopId,etsyToken,etsyFetch}=options;
  if(!printifyShopId||!etsyShopId)return {result:"unknown"};
  let listingId=0;
  try{
    const response=await fetch(`https://api.printify.com/v1/shops/${printifyShopId}/products.json?limit=20`,{headers:{Authorization:`Bearer ${printifyToken}`,"User-Agent":"Goldie-Listing-Factory"},cache:"no-store"});
    if(!response.ok)return {result:"unknown"};
    const payload=await response.json() as {data?:PrintifyProduct[]};
    for(const product of payload.data||[]){
      const id=Number(product.external?.id);
      if(Number.isInteger(id)&&id>0){listingId=id;break}
    }
  }catch{return {result:"unknown"}}
  /* Nothing published from this store yet, so there is no evidence either way.
     Publishing itself will settle it, and D637's bounded failure explains it. */
  if(!listingId)return {result:"unknown"};
  try{
    await etsyFetch<unknown>(`/shops/${etsyShopId}/listings/${listingId}`,etsyToken);
    return {result:"matched",listingId};
  }catch(error){
    const message=error instanceof Error?error.message:"";
    /* Etsy says this listing is not in the connected shop. That is the real
       mismatch, and the only thing worth blocking on. Any other failure - rate
       limit, outage, expired token - is not an answer about shop identity. */
    if(/\b404\b|not found/i.test(message))return {result:"mismatched",listingId};
    return {result:"unknown",listingId};
  }
}

export function shopMismatch(printifyShopTitle:string,etsyShopName:string){
  return {
    title:"These two shops are not the same.",
    error:`This Printify store publishes to a different Etsy shop than the one Goldie is connected to.`,
    issues:[
      `Printify store: ${printifyShopTitle}`,
      `Goldie's Etsy shop: ${etsyShopName}`,
      `Goldie checked a listing this Printify store already published and Etsy does not have it in ${etsyShopName}, so these are different shops - not just different names. Connect both to the same shop: reconnect Etsy from Connections in the sidebar, or choose a product from the Printify store that publishes to ${etsyShopName}.`,
    ],
  };
}
