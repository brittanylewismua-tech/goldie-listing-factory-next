export const PLANS = {
  // `goldie` is retained as the stored key so existing $29 customers remain on
  // the correct plan. Its public name is now Starter.
  goldie: { key: "goldie", name: "Starter", price: 29, drafts: 100, dailyListings: 40, aiMockups: 50, mockupSets: 10, mockupsPerSet: 50 },
  pro: { key: "pro", name: "Pro", price: 59, drafts: 300, dailyListings: 75, aiMockups: 150, mockupSets: 30, mockupsPerSet: 50 },
  scale: { key: "scale", name: "Scale", price: 99, drafts: 750, dailyListings: 100, aiMockups: 300, mockupSets: 75, mockupsPerSet: 50 },
} as const;

export const TRIAL_PLAN = { key: "trial", name: "Free Trial", price: 0, drafts: 10, dailyListings: 10, aiMockups: 6, mockupSets: 2, mockupsPerSet: 10 } as const;
export const MASTERMIND_BETA_PLAN = { key: "mastermind_beta", name: "Mastermind beta", price: 0, drafts: 20, dailyListings: 20, aiMockups: 20, mockupSets: 10, mockupsPerSet: 50 } as const;

export type PlanKey = keyof typeof PLANS;
export const planFor = (key?: string | null) => key === "trial" ? TRIAL_PLAN : key === "mastermind_beta" ? MASTERMIND_BETA_PLAN : PLANS[(key && key in PLANS ? key : "goldie") as PlanKey];
export const monthKey = (date = new Date()) => date.toISOString().slice(0, 7);
export function nextReset(date = new Date()) { return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString(); }
