// Scenario calculator, not live billing or a spending cap. Rates checked 2026-09-05.
export function monthlyCost(usage) {
  for (const [name,value] of Object.entries(usage)) if (!Number.isFinite(value)||value<0) throw new Error(`Invalid usage: ${name}`);
  const over=(amount,included,unit,rate)=>Math.max(0,(amount||0)-included)/unit*rate;
  const components={
    workers:5+over(usage.requests,10e6,1e6,0.30)+over(usage.cpuMs,30e6,1e6,0.02),
    r2Storage:over(usage.r2GbMonths,10,1,0.015),
    // R2 billable units are rounded up; keep free allowances separate.
    r2Writes:Math.ceil(Math.max(0,(usage.r2Writes||0)-1e6)/1e6)*4.50,
    r2Reads:Math.ceil(Math.max(0,(usage.r2Reads||0)-10e6)/1e6)*0.36,
    d1Reads:over(usage.d1Reads,25e9,1e6,0.001),
    d1Writes:over(usage.d1Writes,50e6,1e6,1),
    d1Storage:over(usage.d1GbMonths,5,1,0.75),
    imageTransforms:over(usage.uniqueImageTransforms,5000,1000,0.50),
    logs:over(usage.logEvents,20e6,1e6,0.60),
    workflowSteps:over(usage.workflowSteps,500000,100000,0.80),
    workflowStorage:over(usage.workflowGbMonths,1,1,0.20),
    ai:usage.aiCostUsd||0,
    otherSubscriptions:usage.otherSubscriptionsUsd||0,
  };
  return {components,total:Object.values(components).reduce((sum,value)=>sum+value,0)};
}

// Observed fal account sample: 203 billing events, $0.184466, September 1–5.
// This is a sample mean, NOT a provider rate or per-call upper bound.
export const OBSERVED_AI_CALL_MEAN=0.184466/203;
export function listingScenario(customers,draftsPerCustomer,aiCallsPerDraft=3) {
  const drafts=customers*draftsPerCustomer;
  return {drafts,...monthlyCost({requests:drafts*100,cpuMs:drafts*100*25,
    r2GbMonths:drafts*0.01*3,r2Writes:drafts*10,r2Reads:drafts*100,
    d1Reads:drafts*1000,d1Writes:drafts*100,d1GbMonths:1,
    uniqueImageTransforms:0,logEvents:drafts*200,
    aiCostUsd:drafts*aiCallsPerDraft*OBSERVED_AI_CALL_MEAN})};
}
