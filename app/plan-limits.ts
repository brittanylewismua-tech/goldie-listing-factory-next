/*
  AI-RENDERED MOCKUPS ARE GONE, AND SO IS THEIR ALLOWANCE.

  Sellers upload their own mockups now. The generator that used to make them
  was taken out of the interface, but its allowance stayed in every plan — so
  the pricing page went on advertising 50, 150 and 300 AI mockups a month, and
  the usage screen went on showing a counter for them, for a feature with no
  way to reach it. Somebody comparing Starter to Pro was weighing a number that
  means nothing, and the difference between the tiers looked bigger than it is.

  The field is deleted rather than zeroed. A zero still renders, and
  "0 of 0 AI mockups" is a worse lie than saying nothing at all.
*/
export const PLANS = {
  // `goldie` is retained as the stored key so existing $29 customers remain on
  // the correct plan. Its public name is now Starter.
  goldie: { key: "goldie", name: "Starter", price: 14.99, drafts: 100, dailyListings: 40, mockupSets: 10, mockupsPerSet: 50, annualPrice: 149 },
  pro: { key: "pro", name: "Pro", price: 24.99, drafts: 250, dailyListings: 75, mockupSets: 30, mockupsPerSet: 50, annualPrice: 249 },
  scale: { key: "scale", name: "Scale", price: 39.99, drafts: 500, dailyListings: 100, mockupSets: 75, mockupsPerSet: 50, annualPrice: 399 },
} as const;

export const TRIAL_PLAN = { key: "trial", name: "Free Trial", price: 0, drafts: 10, dailyListings: 10, mockupSets: 2, mockupsPerSet: 10 } as const;
export const MASTERMIND_BETA_PLAN = { key: "mastermind_beta", name: "Mastermind beta", price: 0, drafts: 10, dailyListings: 10, mockupSets: 10, mockupsPerSet: 50 } as const;
export const OWNER_TEST_PLAN = { key: "owner_test", name: "Owner testing", price: 0, drafts: 10000, dailyListings: 1000, mockupSets: 1000, mockupsPerSet: 50 } as const;

export type PlanKey = keyof typeof PLANS;
export type BillingInterval = "month" | "year";
export function planAmount(plan: PlanKey, interval: BillingInterval) {
  return Math.round((interval === "year" ? PLANS[plan].annualPrice : PLANS[plan].price) * 100);
}
// Existing customers retain their purchased allowance. New subscriptions store
// a versioned entitlement; billing frequency does not change the monthly bucket.
export const LEGACY_PLANS = {
  goldie: { ...PLANS.goldie, price: 29, drafts: 100 },
  pro: { ...PLANS.pro, price: 59, drafts: 300 },
  scale: { ...PLANS.scale, price: 99, drafts: 750 },
};
export function planFor(key?: string | null, owner = false) {
  if (owner) return OWNER_TEST_PLAN;
  if (key === "trial") return TRIAL_PLAN;
  if (key === "mastermind_beta") return MASTERMIND_BETA_PLAN;
  for (const plan of ["goldie", "pro", "scale"] as const) if (key === `${plan}_2026_09`) return PLANS[plan];
  return LEGACY_PLANS[(key && Object.hasOwn(LEGACY_PLANS, key) ? key : "goldie") as PlanKey];
}
export const monthKey = (date = new Date()) => date.toISOString().slice(0, 7);
export function nextReset(date = new Date()) { return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString(); }
