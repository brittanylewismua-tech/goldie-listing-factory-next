import { recommendedPrice, type PricingRules } from "./pricing.ts";

export type ActualVariantCost={id:number;title?:string;cost:number;price:number;isEnabled:boolean};
export type ActualCostReview={required:true;verified:boolean;approved:boolean;variants:ActualVariantCost[]};

export function actualCostReview(variants:ActualVariantCost[],expectedCosts:Record<string,number>={},expectedPrices:Record<string,number>={}):ActualCostReview{
  const enabled=variants.filter(variant=>variant.isEnabled);
  const verified=enabled.length>0&&enabled.every(variant=>Number.isFinite(variant.cost)&&variant.cost>=0&&Number.isFinite(variant.price)&&variant.price>=variant.cost);
  /* The seller already approved these exact costs and prices while saving the
     product. Ask again only when the finished Printify product changed one of
     them. This keeps the actual-cost safeguard without manufacturing a task for
     every ordinary draft. */
  const approved=verified&&enabled.every(variant=>
    Object.prototype.hasOwnProperty.call(expectedCosts,String(variant.id))&&
    Object.prototype.hasOwnProperty.call(expectedPrices,String(variant.id))&&
    Number(expectedCosts[String(variant.id)])===variant.cost&&
    Number(expectedPrices[String(variant.id)])===variant.price
  );
  return {required:true,verified,approved,variants:enabled};
}

export function pricesFromActualCosts(review:ActualCostReview,pricing:PricingRules){
  if(!review.verified)throw new Error("Actual Printify costs must be verified before pricing.");
  return Object.fromEntries(review.variants.map(variant=>[String(variant.id),recommendedPrice(variant.cost,pricing)]));
}
