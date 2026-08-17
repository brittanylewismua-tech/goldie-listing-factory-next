export const PLANS = {
  goldie: { key: "goldie", name: "Goldie", price: 29, drafts: 200, aiMockups: 100, mockupSets: 10, mockupsPerSet: 50 },
  scale: { key: "scale", name: "Goldie Scale", price: 59, drafts: 750, aiMockups: 300, mockupSets: 30, mockupsPerSet: 50 },
} as const;

export const TRIAL_PLAN = { key: "trial", name: "Goldie trial", price: 0, drafts: 10, aiMockups: 5, mockupSets: 1, mockupsPerSet: 10 } as const;
export const MASTERMIND_BETA_PLAN = { key: "mastermind_beta", name: "Mastermind beta", price: 0, drafts: 20, aiMockups: 20, mockupSets: 10, mockupsPerSet: 50 } as const;

export type PlanKey = keyof typeof PLANS;
export const planFor = (key?: string | null) => key === "trial" ? TRIAL_PLAN : key === "mastermind_beta" ? MASTERMIND_BETA_PLAN : PLANS[(key && key in PLANS ? key : "goldie") as PlanKey];
export const monthKey = (date = new Date()) => date.toISOString().slice(0, 7);
export function nextReset(date = new Date()) { return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString(); }
