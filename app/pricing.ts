export type PricingRules = { targetProfit?: number; etsyFeePercent?: number; fixedFee?: number; listingFee?: number; shippingCost?: number; shippingCharged?: number };

export function estimatedProfit(priceCents: number, costCents: number, pricing?: PricingRules) {
  const percent = Math.max(0, Math.min(40, Number(pricing?.etsyFeePercent || 0))) / 100;
  const revenue = priceCents / 100;
  const fees = revenue * percent + Number(pricing?.fixedFee || 0) + Number(pricing?.listingFee || 0);
  return revenue - costCents / 100 - fees;
}

export function recommendedPrice(costCents: number, pricing?: PricingRules) {
  if (!pricing || pricing.targetProfit == null) return costCents;
  const percent = Math.max(0, Math.min(40, Number(pricing.etsyFeePercent || 0))) / 100;
  const fixed = Number(pricing.fixedFee || 0) + Number(pricing.listingFee || 0);
  const dollars = (costCents / 100 + Number(pricing.targetProfit) + fixed) / Math.max(0.01, 1 - percent);
  return Math.max(costCents, Math.ceil(dollars * 100));
}
