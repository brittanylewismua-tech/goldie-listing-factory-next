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
  /*
    Dollars per call, and where the number came from. These are four
    different kinds of claim and conflating them is how a published price
    ends up quoted as our cost:

      documented - the provider's published list price. True about the price
                   list, not about us; we may be inside an included tier.
      estimated  - our own arithmetic from token counts. Never billed yet.
      measured   - observed from a provider usage block on a real call.
      settled    - reconciled against what the provider actually charged.
      unknown    - not yet observed. unitCost stays 0 and the workload is
                   capped by request count instead of dollars.
  */
  unitCost: number;
  costBasis: "documented" | "calculated" | "estimated" | "measured" | "settled" | "unknown";
  customerFacing: boolean;
  memberDailyLimit: number | null;
  globalDailyCeiling: number;
  /*
    A request-count ceiling for workloads whose cost is unknown. Without it
    an unmeasured workload reserves zero dollars and so behaves as free —
    the dollar guard would wave through an unlimited number of them.
  */
  globalDailyRequests: number | null;
  /* Where a member's allowance is spent: successful actions, and a separate,
     higher cap on provider attempts so repeated failures cannot bill forever. */
  memberDailyAttempts: number | null;
  /* temporary = in force now to stop unmetered spend, but a holding number
     awaiting real measurement, not an approved permanent limit. */
  limitStatus: "approved" | "temporary" | "proposed";
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
    /* Cache-miss arithmetic, which is the conservative figure: the prompt is
       written to cache at 2x rather than read at 0.1x. Reservations use it. */
    unitCost: 0.0039, costBasis: "estimated",
    customerFacing: true,
    memberDailyLimit: 10, memberDailyAttempts: 15,
    globalDailyCeiling: 2, globalDailyRequests: null, limitStatus: "approved",
    retries: 1,
    cachePolicy: "By normalized content hash per member. A repeat file returns the stored fingerprint and costs nothing. Changing only the niche reuses the fingerprint.",
    priority: 1,
    expectedBehaviour: "Bursty. A member scans several designs in one sitting, then nothing for days.",
  },
  {
    key: "referenceIngestion",
    what: "One extraction per unique sales-backed reference image, batched.",
    provider: "fal / openrouter", model: "google/gemini-2.5-flash",
    /*
      MEASURED, not estimated. 44 reference images analysed in one run on
      2026-09-15 billed $0.03298 — $0.00075 each, against an estimate of
      $0.0020. The whole 860-listing corpus is therefore about $0.65, or three
      days inside the approved ceiling.
    */
    unitCost: 0.00075, costBasis: "measured",
    customerFacing: false,
    memberDailyLimit: null, memberDailyAttempts: null,
    globalDailyCeiling: 0.25, globalDailyRequests: 100, limitStatus: "approved",
    retries: 1,
    cachePolicy: "Keyed on the Etsy image identity and the analysis version. An image already analysed at the current version is never analysed again, for any member. A listing that swaps its photo is a new image; a version bump writes a new row and keeps the old one.",
    priority: 9,
    expectedBehaviour: "Steady trickle following new sales. Bounded at 100 images per day.",
  },
  {
    key: "nicheClassifier",
    what: "One canonical niche list for a shop, then batched assignment against it.",
    provider: "fal / openrouter", model: "google/gemini-2.5-flash",
    /*
      Unknown until Gemini has actually billed, so it stays 0 like every
      other unmeasured workload. The reservation is handled separately, at
      the full member ceiling, by CONSERVATIVE_RESERVATION.
    */
    unitCost: 0, costBasis: "unknown",
    customerFacing: true,
    memberDailyLimit: 1, memberDailyAttempts: 2,
    globalDailyCeiling: 1, globalDailyRequests: 40, limitStatus: "approved",
    retries: 1,
    cachePolicy: "Cached per listing until its title, tags or section change. An unchanged listing is never reclassified, and an incremental build sends only changed or new listings.",
    priority: 3,
    expectedBehaviour: "At most one build per member per day. Internal beta: one account only.",
  },
  {
    key: "listingFamilyCopy",
    what: "One text-only call covering every product family for a design. No image.",
    provider: "fal / openrouter", model: "google/gemini-2.5-flash",
    unitCost: 0, costBasis: "unknown",
    customerFacing: true,
    memberDailyLimit: 50, memberDailyAttempts: 75,
    globalDailyCeiling: 5, globalDailyRequests: 1_000, limitStatus: "temporary",
    retries: 1,
    cachePolicy: "By member, artwork hash, design-intelligence version, the SORTED set of families, copy prompt version and model version. A later family asks only for the ones missing. A family missing from a response takes deterministic copy; it is never retried on its own, because per-family retries are the fan-out this replaced.",
    priority: 2,
    expectedBehaviour: "At most one per design per batch. Warm cache makes a repeat batch free.",
  },
  {
    key: "listingIntelligenceVision",
    what: "Title, keyword and attribute pre-fill for a Listing Factory publish. TWO calls per listing today.",
    provider: "fal / openrouter", model: "google/gemini-2.5-flash",
    unitCost: 0, costBasis: "unknown",
    customerFacing: true,
    memberDailyLimit: 50, memberDailyAttempts: 75,
    globalDailyCeiling: 15, globalDailyRequests: 2_000, limitStatus: "temporary",
    retries: 1,
    cachePolicy: "AUDITED AND WASTEFUL. The title call is excluded from the cache entirely, and the details call keys on the whole request body - product facts, title and tags included - so one design across twenty products misses twenty times. Design-level understanding must key on the artwork hash alone.",
    priority: 2,
    expectedBehaviour: "One to two calls per listing published. A member doing a batch drop may publish twenty in an evening.",
  },
  {
    key: "mockupPrintArea",
    what: "Print-area detection when preparing a mockup.",
    provider: "fal / openrouter", model: "google/gemini-2.5-flash",
    unitCost: 0, costBasis: "unknown",
    customerFacing: true,
    memberDailyLimit: 40, memberDailyAttempts: 60,
    globalDailyCeiling: 10, globalDailyRequests: 500, limitStatus: "temporary",
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
    memberDailyLimit: 40, memberDailyAttempts: 60,
    globalDailyCeiling: 10, globalDailyRequests: 500, limitStatus: "temporary",
    retries: 1,
    cachePolicy: "Per mockup image.",
    priority: 4,
    expectedBehaviour: "Once per mockup analyzed.",
  },
  {
    key: "imageTransformation",
    what: "Cloudflare Images transformations beyond the included 5,000 per month.",
    provider: "cloudflare", model: "images",
    /* Cloudflare's published marginal price after the included 5,000 per
       month. It is documented, not something we have measured about Goldie. */
    unitCost: 0.0005, costBasis: "documented",
    customerFacing: true,
    memberDailyLimit: null, memberDailyAttempts: null,
    globalDailyCeiling: 5, globalDailyRequests: null, limitStatus: "proposed",
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
    memberDailyLimit: null, memberDailyAttempts: null,
    globalDailyCeiling: 2, globalDailyRequests: null, limitStatus: "proposed",
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
    memberDailyLimit: 1, memberDailyAttempts: null,
    globalDailyCeiling: 5, globalDailyRequests: null, limitStatus: "proposed",
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
    memberDailyLimit: 5, memberDailyAttempts: null,
    globalDailyCeiling: 5, globalDailyRequests: null, limitStatus: "proposed",
    retries: 1,
    cachePolicy: "Per event, shared across every member watching it. Never per member per event.",
    priority: 7,
    expectedBehaviour: "Event-driven. Classification stays deterministic; only the explanation would be paid.",
  },
];

export const workload = (key: string) => PAID_WORKLOADS.find(entry => entry.key === key) ?? null;

/** Ceilings that are actually in force. A proposed limit is advisory. */
export const enforcedWorkloads = () =>
  PAID_WORKLOADS.filter(entry => entry.limitStatus !== "proposed");

/** When the budget is tight, customer work runs and background work waits. */
export const byPriority = () =>
  [...PAID_WORKLOADS].sort((a, b) =>
    Number(b.customerFacing) - Number(a.customerFacing) || a.priority - b.priority);
