/**
 * FOUNDATIONAL SCHEMA IS CREATED BY DEPLOYING, NOT BY A MEMBER.
 *
 * Every table in Goldie was created lazily: the first call that needed one ran
 * `CREATE TABLE IF NOT EXISTS` on its way past. That works, and it has two
 * costs that only appear once real members arrive.
 *
 * The first is that a member's first action carries a schema migration. If it
 * fails — a lock, a timeout, a column a later release added — the failure
 * surfaces as their first click not working.
 *
 * The second is that the capability registry cannot tell "this feature is
 * broken" from "nobody has used it yet", because both look like a missing
 * table. Listing Factory reported not-ready for exactly that reason.
 *
 * So this runs every schema owner ONCE at deploy. It is not a new set of DDL —
 * duplicating the statements is how two definitions of one table drift apart.
 * It calls the same `ensure*` functions the runtime calls, which keeps one
 * definition per table and makes the deploy pass simply the first caller.
 *
 * ORDER MATTERS AND IS NOT ALPHABETICAL. Anything that adds a column another
 * statement indexes has to run before it. SQLite will not reorder for us, and
 * this codebase has lost three deploys to that fact.
 *
 * EVERY ENTRY IS IDEMPOTENT. Running twice is the normal case — every deploy
 * runs it — so each `ensure*` uses IF NOT EXISTS and tolerates a duplicate
 * column error and nothing else.
 */
import { ensureMarketCollections } from "@/app/market-collection";
import { ensureEtsyDisplayCache } from "@/app/etsy-display-cache";
import { ensureCleanupQueue } from "@/app/connection-cleanup";
import { ensureRequestLimits } from "@/app/request-limits";
import { ensureBriefRunTable } from "@/app/niche-brief-refresh";
import { env } from "cloudflare:workers";
import { ensureErrorLog } from "@/app/error-log";
import { ensureBillingTables } from "@/app/billing";
import { ensureSpendTables } from "@/app/spend-guard";
import { ensureVisionTables } from "@/app/vision-telemetry";
import { ensureFalUsageTable } from "@/app/fal-usage";
import { ensurePublishIdentityTable, ensureBlueprintQueue } from "@/app/publish-identity";
import { ensureProvenanceTables } from "@/app/artwork-provenance";
import { ensureCaptureQueue } from "@/app/artwork-capture-queue";
import { ensureMockupAnalysisTable } from "@/app/mockup-analysis-cache";
import { ensureDesignIntelligenceTable } from "@/app/design-intelligence";
import { ensureWorkLeaseTable } from "@/app/work-lease";
import { ensureFamilyCopyTable } from "@/app/family-copy-store";
import { ensureDeletionAudit } from "@/app/api/account/delete/route";
import { ensureMarketTables } from "@/app/market-store";
import { ensureCorrelationTables } from "@/app/correlation-worker";
import { ensureObservationTables } from "@/app/market-observation";
import { ensureCandidateTables } from "@/app/niche-candidate-store";
import { ensureBaselineTables } from "@/app/shop-baseline";
import { ensurePollTables } from "@/app/listing-poller";
import { ensureShopWatchTables } from "@/app/shop-watch";
import { ensureBriefTables } from "@/app/shop-watch-brief";
import { ensureNicheWatchTables } from "@/app/niche-watch-store";
import { ensureReferenceImageTable } from "@/app/reference-image-store";
import { ensureFinanceTables } from "@/app/finance-store";
import { ensureListingTables } from "@/app/shop-map-listings";
import { ensureScopeColumn } from "@/app/shop-map-auth";
import { ensureTargetTable } from "@/app/shop-map-targets";
import { ensureRegisterTables } from "@/app/trademark-register";
import { ensurePrintifyMeter } from "@/app/printify-call";
import { ensureEntitlementTables } from "@/app/entitlements";
import { ensureScannerTables } from "@/app/scanner-store";

export type Step = { name: string; run: () => Promise<unknown> };

/* Two owners take the database explicitly rather than reaching for the
   binding themselves. Passing it is the whole difference between a step that
   runs and one that reports "Cannot read properties of undefined". */
const database = () => (env as unknown as { DB: D1Database }).DB;

/*
  Ordered by dependency, then by how early a member can reach the feature.
  `error_log` is first because everything after it wants somewhere to record a
  failure.
*/
export const MIGRATIONS: Step[] = [
  { name: "error_log", run: () => ensureErrorLog(database()) },
  { name: "etsy_listing_display_cache", run: ensureEtsyDisplayCache },
  { name: "billing", run: ensureBillingTables },
  { name: "entitlements", run: ensureEntitlementTables },
  { name: "spend_guard", run: ensureSpendTables },
  { name: "vision_telemetry", run: ensureVisionTables },
  { name: "fal_usage", run: ensureFalUsageTable },

  /* Listing Factory. `publish_identity` and `blueprint_mapping_queue` live in
     the same owner, and both were previously created by a member's first
     batch. */
  { name: "publish_identity", run: ensurePublishIdentityTable },
  { name: "blueprint_mapping_queue", run: ensureBlueprintQueue },
  { name: "artwork_provenance", run: ensureProvenanceTables },
  { name: "artwork_capture_jobs", run: ensureCaptureQueue },
  { name: "mockup_analysis_cache", run: ensureMockupAnalysisTable },
  { name: "design_intelligence", run: ensureDesignIntelligenceTable },
  /* The lease that stops two requests paying twice for the same work, and the
     family-copy table the call plan has costed since it was written but which
     had never existed — so every batch was a cold batch by construction. */
  { name: "work_leases", run: ensureWorkLeaseTable },
  { name: "listing_family_copy", run: ensureFamilyCopyTable },
  /* The deletion audit. It must exist before the first deletion, not be
     created by it — a table created mid-run cannot record that the run began. */
  { name: "account_deletions", run: async () => {
      const { env } = await import("cloudflare:workers");
      await ensureDeletionAudit((env as unknown as { DB: D1Database }).DB);
    } },

  /* Market detector, then the things that read it. */
  { name: "market_store", run: ensureMarketTables },
  { name: "correlations", run: ensureCorrelationTables },
  { name: "market_observations", run: ensureObservationTables },
  { name: "niche_candidates", run: ensureCandidateTables },
  { name: "shop_baselines", run: ensureBaselineTables },
  { name: "listing_poller", run: ensurePollTables },
  { name: "shop_watch", run: ensureShopWatchTables },
  { name: "shop_watch_briefs", run: ensureBriefTables },
  { name: "niche_watches", run: ensureNicheWatchTables },
  { name: "market_keyword_collections", run: () => ensureMarketCollections(database()) },
  { name: "reference_images", run: ensureReferenceImageTable },
  { name: "scanner", run: ensureScannerTables },

  /* Shop Map. `ensureScopeColumn` ALTERs etsy_connections and must run before
     anything reads `scopes`. */
  { name: "etsy_connection_scopes", run: ensureScopeColumn },
  { name: "shop_map_targets", run: ensureTargetTable },
  { name: "shop_map_listings", run: ensureListingTables },
  { name: "finance", run: ensureFinanceTables },

  { name: "trademark_register", run: () => ensureRegisterTables(database()) },
  { name: "connection_cleanup_queue", run: () => ensureCleanupQueue(database()) },
  /*
    The request limiter runs on every API call, so this table must exist before
    the first one — not be created by it. A limiter whose table is missing
    fails open, which is the safe behaviour for an outage and the wrong
    behaviour for a deploy.
  */
  { name: "request_limits", run: () => ensureRequestLimits(database()) },
  /* The brief refresh reads this on every run to decide what is due; it must
     exist before the first scheduled run, not be created by it. */
  { name: "niche_brief_runs", run: () => ensureBriefRunTable(database()) },
  /* The Printify meter records the moment it began measuring, and everything
     before that moment is reported as unmeasured. Creating it at deploy means
     that moment is the deploy, rather than whenever the first call happened to
     be made — which is the difference between a known boundary and a guess. */
  { name: "printify_api_calls", run: ensurePrintifyMeter },
];

export type Outcome = {
  name: string; ok: boolean; milliseconds: number; error?: string;
};

/**
 * Run them all, and keep going.
 *
 * One failing step must not stop the twenty behind it: a deploy that creates
 * twenty-two tables and reports one failure is far more useful than one that
 * creates six and stops.
 */
export async function runMigrations(steps: Step[] = MIGRATIONS): Promise<Outcome[]> {
  const outcomes: Outcome[] = [];
  for (const step of steps) {
    const began = Date.now();
    try {
      await step.run();
      outcomes.push({ name: step.name, ok: true, milliseconds: Date.now() - began });
    } catch (error) {
      outcomes.push({ name: step.name, ok: false, milliseconds: Date.now() - began,
        error: error instanceof Error ? error.message : "failed" });
    }
  }
  return outcomes;
}
