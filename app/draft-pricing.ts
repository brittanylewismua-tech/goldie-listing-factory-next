import { recommendedPrice, type PricingRules } from "./pricing.ts";

export type ActualVariantCost={id:number;title?:string;cost:number;price:number;isEnabled:boolean};
export type ActualCostReview={required:true;verified:boolean;approved:boolean;variants:ActualVariantCost[]};

export function actualCostReview(variants:ActualVariantCost[]):ActualCostReview{
  const enabled=variants.filter(variant=>variant.isEnabled);
  return {required:true,verified:enabled.length>0&&enabled.every(variant=>Number.isFinite(variant.cost)&&variant.cost>=0&&Number.isFinite(variant.price)&&variant.price>=variant.cost),approved:false,variants:enabled};
}

export function pricesFromActualCosts(review:ActualCostReview,pricing:PricingRules){
  if(!review.verified)throw new Error("Actual Printify costs must be verified before pricing.");
  return Object.fromEntries(review.variants.map(variant=>[String(variant.id),recommendedPrice(variant.cost,pricing)]));
}
