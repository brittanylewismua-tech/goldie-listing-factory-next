/**
 * EVERY PAID CALL IS DECLARED HERE OR IT DOES NOT EXIST.
 *
 * The audit that produced this list found paid vision already running in
 * production — two Gemini calls per listing through fal.run — with its cost
 * written to console.info and stored nowhere. That is not a small gap: it
 * means the spend for the busiest paid feature in the product cannot be
 * queried, attributed to a member, or capped. A registry that omitted it
 * would be a registry of the things we happened to remember.
 *
 * A workload declared here has a ceiling, a member limit, a retry policy and
 * a priority. The metering layer refuses anything not declared, so adding a
 * provider call without thinking about its cost is a build failure rather
 * than a surprise on an invoice.
 *
 * LIMITS MARKED `proposed` ARE NOT IN FORCE. Only designScannerVision is
 * approved. The rest are recommendations awaiting sign-off, and the code
 * treats a proposed limit as advisory so nothing silently starts enforcing a
 * number nobody approved.
 */
export type Workload = {
  key: string;
  what: string;
  provider: string;
  model: string;
  /* Dollars per call. `measured` means observed from a provider usage block;
     `estimated` means arithmetic that has not yet been checked against a bill. */
  unitCost: number;
  costBasis: "measured" | "estimated" | "unknown";
  customerFacing: boolean;
  memberDailyLimit: number | null;
  globalDailyCeiling: number;
  limitStatus: "approved" | "proposed";
  retries: number;
  cachePolicy: string;
  /* Lower runs first when the budget is tight. Customer-facing work outranks
     background work, always. */
  priority: number;
  expectedBehaviour: string;
};

export const PAID_WORKLOADS: Workload[] = [
  {
    key: "designScannerVision",
    what: "One structured extraction per uploaded design.",
    provider: "anthropic", model: "claude-haiku-4-5-20251001",
    unitCost: 0.0039, costBasis: "estimated",
    customerFacing: true,
    memberDailyLimit: 10, globalDailyCeiling: 25, limitStatus: "approved",
    retries: 1,
    cachePolicy: "By normalized content hash per member. A repeat file returns the stored fingerprint and costs nothing. Changing only the niche reuses the fingerprint.",
    priority: 1,
    expectedBehaviour: "Bursty. A member scans several designs in one sitting, then nothing for days.",
  },
  {
    key: "referenceIngestion",
    what: "One extraction per unique sales-backed reference image, batched.",
    provider: "anthropic", model: "claude-haiku-4-5-20251001",
    unitCost: 0.0020, costBasis: "estimated",
    customerFacing: false,
    memberDailyLimit: null, globalDailyCeiling: 0.50, limitStatus: "approved",
    retries: 1,
    cachePolicy: "Deduplicated by authorized content hash before the call. An image already analyzed is never analyzed again, for any member.",
    priority: 9,
    expectedBehaviour: "Steady trickle following new sales. Bounded at 100 images per day.",
  },
  {
    key: "listingIntelligenceVision",
    what: "Title, keyword and attribute pre-fill for a Listing Factory publish. TWO calls per listing today.",
    provider: "fal / openrouter", model: "google/gemini-2.5-flash",
    unitCost: 0, costBasis: "unknown",
    customerFacing: true,
    memberDailyLimit: 40, globalDailyCeiling: 15, limitStatus: "proposed",
    retries: 1,
    cachePolicy: "None today. A resubmitted image is billed again.",
    priority: 2,
    expectedBehaviour: "One to two calls per listing published. A member doing a batch drop may publish twenty in an evening.",
  },
  {
    key: "mockupPrintArea",
    what: "Print-area detection when preparing a mockup.",
    provider: "fal / openrouter", model: "google/gemini-2.5-flash",
    unitCost: 0, costBasis: "unknown",
    customerFacing: true,
    memberDailyLimit: 40, globalDailyCeiling: 10, limitStatus: "proposed",
    retries: 1,
    cachePolicy: "Per prepared mockup. Re-preparing the same mockup repeats the call.",
    priority: 3,
    expectedBehaviour: "Once per mockup added to the library.",
  },
  {
    key: "mockupSegmentation",
    what: "Garment segmentation when analyzing a mockup.",
    provider: "fal", model: "fal-ai/sam-3",
    unitCost: 0, costBasis: "unknown",
    customerFacing: true,
    memberDailyLimit: 40, globalDailyCeiling: 10, limitStatus: "proposed",
    retries: 1,
    cachePolicy: "Per mockup image.",
    priority: 4,
    expectedBehaviour: "Once per mockup analyzed.",
  },
  {
    key: "imageTransformation",
    what: "Cloudflare Images transformations beyond the included 5,000 per month.",
    provider: "cloudflare", model: "images",
    unitCost: 0.0005, costBasis: "measured",
    customerFacing: true,
    memberDailyLimit: null, globalDailyCeiling: 5, limitStatus: "proposed",
    retries: 0,
    cachePolicy: "Cloudflare bills a unique input-and-flags combination once per calendar month. The customer scan path uses none: the browser normalizes.",
    priority: 5,
    expectedBehaviour: "Reference ingestion and mockup work only.",
  },
  {
    key: "transactionalEmail",
    what: "Trial reminders and member notifications.",
    provider: "resend", model: "email",
    unitCost: 0.0004, costBasis: "estimated",
    customerFacing: false,
    memberDailyLimit: null, globalDailyCeiling: 2, limitStatus: "proposed",
    retries: 1,
    cachePolicy: "Send-once per member per reminder stage.",
    priority: 8,
    expectedBehaviour: "Scheduled, proportional to trials starting.",
  },
  {
    key: "shopWatchSummary",
    what: "Morning brief wording for saved competitor shops. NOT BUILT YET.",
    provider: "anthropic", model: "claude-haiku-4-5-20251001",
    unitCost: 0.0008, costBasis: "estimated",
    customerFacing: true,
    memberDailyLimit: 1, globalDailyCeiling: 5, limitStatus: "proposed",
    retries: 1,
    cachePolicy: "One brief per member per morning, generated once and reread freely.",
    priority: 6,
    expectedBehaviour: "Exactly one per member per day. Extraction and change detection stay deterministic; only the wording would be paid.",
  },
  {
    key: "marketWatchExplanation",
    what: "Plain wording for a detected market event. NOT BUILT YET.",
    provider: "anthropic", model: "claude-haiku-4-5-20251001",
    unitCost: 0.0006, costBasis: "estimated",
    customerFacing: true,
    memberDailyLimit: 5, globalDailyCeiling: 5, limitStatus: "proposed",
    retries: 1,
    cachePolicy: "Per event, shared across every member watching it. Never per member per event.",
    priority: 7,
    expectedBehaviour: "Event-driven. Classification stays deterministic; only the explanation would be paid.",
  },
];

export const workload = (key: string) => PAID_WORKLOADS.find(entry => entry.key === key) ?? null;

/** Ceilings that are actually in force. A proposed limit is advisory. */
export const enforcedWorkloads = () =>
  PAID_WORKLOADS.filter(entry => entry.limitStatus === "approved");

/** When the budget is tight, customer work runs and background work waits. */
export const byPriority = () =>
  [...PAID_WORKLOADS].sort((a, b) =>
    Number(b.customerFacing) - Number(a.customerFacing) || a.priority - b.priority);
