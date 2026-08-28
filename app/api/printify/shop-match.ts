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
  /* D646 · D641 asked Etsy for the listing INSIDE the connected shop and read a
     404 as "different shop". A 404 means far more than that - most often the
     listing has since been deleted or hidden, which is exactly what happens to
     test listings and to anything a seller tidies up. So a perfectly correct
     setup started refusing itself:

       Printify store: GODISAGIRLAPPAREL
       Goldie's Etsy shop: godisagirlapparel

     the same shop, refused, because the one listing it happened to sample was
     gone. Twice now this check has blocked a seller who had done nothing wrong,
     which is worse than not checking at all.

     Only positive evidence counts now: fetch the listing itself and read whose
     shop it says it is in. A listing that exists and belongs to another shop is
     a real mismatch. A listing that cannot be fetched proves nothing, so try the
     next candidate and, failing that, say so. */
  let candidates:number[]=[];
  try{
    const response=await fetch(`https://api.printify.com/v1/shops/${printifyShopId}/products.json?limit=20`,{headers:{Authorization:`Bearer ${printifyToken}`,"User-Agent":"Goldie-Listing-Factory"},cache:"no-store"});
    if(!response.ok)return {result:"unknown"};
    const payload=await response.json() as {data?:PrintifyProduct[]};
    candidates=(payload.data||[]).map(product=>Number(product.external?.id)).filter(id=>Number.isInteger(id)&&id>0);
  }catch{return {result:"unknown"}}
  if(!candidates.length)return {result:"unknown"};
  for(const listingId of candidates.slice(0,5)){
    let listing:{shop_id?:number}|null=null;
    try{listing=await etsyFetch<{shop_id?:number}>(`/listings/${listingId}`,etsyToken)}catch{continue}
    const owner=Number(listing?.shop_id);
    if(!owner)continue;
    if(owner===etsyShopId)return {result:"matched",listingId};
    return {result:"mismatched",listingId};
  }
  return {result:"unknown"};
}

export function shopMismatch(printifyShopTitle:string,etsyShopName:string){
  return {
    title:"These two shops are not the same.",
    error:`This Printify store publishes to a different Etsy shop than the one Goldie is connected to.`,
    issues:[
      `Printify store: ${printifyShopTitle}`,
      `Goldie's Etsy shop: ${etsyShopName}`,
      `Goldie read a listing this Printify store published and Etsy says it belongs to a different shop, so these are two storefronts - not one storefront with two names. Connect both to the same shop: reconnect Etsy from Connections in the sidebar, or choose a product from the Printify store that publishes to ${etsyShopName}.`,
    ],
  };
}
