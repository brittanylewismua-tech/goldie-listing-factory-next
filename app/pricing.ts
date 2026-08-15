export type PricingRules = { targetProfit?: number; etsyFeePercent?: number; fixedFee?: number; listingFee?: number; shippingCost?: number; shippingCharged?: number };

export function recommendedPrice(costCents: number, pricing?: PricingRules) {
  if (!pricing || pricing.targetProfit == null) return costCents;
  const percent = Math.max(0, Math.min(40, Number(pricing.etsyFeePercent || 0))) / 100;
  const shippingCharged = Number(pricing.shippingCharged || 0);
  const shippingCost = Math.max(0, Number(pricing.shippingCost || 0));
  const shippingAppliedToCost = Math.min(shippingCost, Math.max(0, shippingCharged));
  const fixed = Number(pricing.fixedFee || 0) + Number(pricing.listingFee || 0) + shippingCost - shippingAppliedToCost + shippingCharged * percent;
  const dollars = (costCents / 100 + Number(pricing.targetProfit) + fixed) / Math.max(0.01, 1 - percent);
  return Math.max(costCents, Math.ceil(dollars * 100));
}
