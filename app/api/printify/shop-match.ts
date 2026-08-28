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

/* D654 - a verdict Goldie could not reach in this long is a verdict it does not
   have. Both numbers are budgets, not timeouts on a seller's own action. */
export const PAIRING_BUDGET_MS=9000;
export const PAIRING_STEP_MS=4000;

function timeoutSignal(ms:number){return AbortSignal.timeout(ms)}

function withTimeout<T>(work:Promise<T>,ms=PAIRING_STEP_MS):Promise<T>{
  return Promise.race([work,new Promise<T>((_,reject)=>setTimeout(()=>reject(new Error("pairing step timed out")),ms))]);
}

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
  /* D654 - this check ran on EVERY product load and could outlive the request
     that needed it. etsyFetch retries a 429 or a 5xx up to five times, backing
     off as far as eight seconds each; five candidate listings therefore cost up
     to about 200 seconds. The browser gives up at 90. Loading a saved product
     stopped completing at all - measured live at over two minutes for a product
     Goldie could not verify.

     Every one of those retries was wasted work: the loop below catches a failed
     fetch and moves on, so a retried failure and an immediate one produce the
     same verdict. Retrying is right for a seller's save; it is wrong for an
     advisory probe whose honest answer is already "unknown". So this now runs
     under one overall deadline and treats slow exactly as it treats broken. */
  const started=Date.now();
  const outOfTime=()=>Date.now()-started>PAIRING_BUDGET_MS;
  let candidates:number[]=[];
  try{
    const response=await withTimeout(fetch(`https://api.printify.com/v1/shops/${printifyShopId}/products.json?limit=20`,{headers:{Authorization:`Bearer ${printifyToken}`,"User-Agent":"Goldie-Listing-Factory"},cache:"no-store",signal:timeoutSignal(PAIRING_STEP_MS)}));
    if(!response.ok)return {result:"unknown"};
    const payload=await response.json() as {data?:PrintifyProduct[]};
    candidates=(payload.data||[]).map(product=>Number(product.external?.id)).filter(id=>Number.isInteger(id)&&id>0);
  }catch{return {result:"unknown"}}
  if(!candidates.length)return {result:"unknown"};
  for(const listingId of candidates.slice(0,5)){
    if(outOfTime())return {result:"unknown"};
    let listing:{shop_id?:number}|null=null;
    try{listing=await withTimeout(etsyFetch<{shop_id?:number}>(`/listings/${listingId}`,etsyToken),PAIRING_STEP_MS)}catch{continue}
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
