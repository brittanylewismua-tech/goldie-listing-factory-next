/* D639 · Goldie created every draft in Printify shop 20191756 (HOWDYANGEL) while
   its Etsy connection was shesawolfclothing - a different storefront entirely.
   Nothing checked. So a seller could connect Printify to one shop and Etsy to
   another, build a whole batch, create Printify drafts, write titles, choose
   photos, approve pricing, and only discover the mismatch at publish, where it
   surfaced as a stall rather than an explanation: Printify accepted a publish
   for a shop Goldie has no Etsy authorisation over, so no listing ever appeared
   in the shop Goldie was watching.

   Printify names an Etsy store after the Etsy shop it publishes to, so the two
   names are comparable once punctuation and case are removed - "She's A Wolf
   Clothing" and "shesawolfclothing" are the same storefront; "HOWDYANGEL" is
   not. Goldie only blocks when it can actually see both names; an unknown name
   is not evidence of a mismatch. */
export function normalizeShopName(value?:string|null){
  return String(value||"").toLowerCase().replace(/[^a-z0-9]+/g,"");
}

export function shopsMatch(printifyShopTitle?:string|null,etsyShopName?:string|null){
  const printify=normalizeShopName(printifyShopTitle),etsy=normalizeShopName(etsyShopName);
  if(!printify||!etsy)return true;
  return printify===etsy;
}

export function shopMismatch(printifyShopTitle:string,etsyShopName:string){
  return {
    error:`This Printify store publishes to a different Etsy shop than the one Goldie is connected to.`,
    issues:[
      `Printify store: ${printifyShopTitle}`,
      `Goldie's Etsy shop: ${etsyShopName}`,
      `Goldie would create the listings in ${printifyShopTitle} and then look for them in ${etsyShopName}, so they would never appear. Connect both to the same shop - reconnect Etsy from Goldie, or choose a product from the Printify store for ${etsyShopName}.`,
    ],
  };
}
