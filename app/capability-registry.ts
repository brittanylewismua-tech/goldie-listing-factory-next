/**
 * WHAT GOLDIE ACTUALLY IS, IN ONE PLACE.
 *
 * Before this file the answer was spread across a feature map, several route
 * comments, the paid-workload registry, a flag table and whatever the code
 * happened to do — and those disagreed. A status list that contradicts another
 * status list is worse than no list, because somebody acts on the wrong one.
 *
 * So this declares the four features and what each one NEEDS, and the
 * accompanying route resolves each need against DEPLOYED STATE — bindings that
 * actually exist, migrations that actually ran, crons that actually
 * succeeded. Nothing here reports a feature as ready because it was meant to
 * be.
 *
 * FOUR FEATURES. Listing Factory, Market Watch, Shop Map, Trademark Checker.
 * Anything not under one of those is not a Goldie feature.
 */
import type { Feature } from "@/app/suite-plans";

export type Access = "everyone" | "canary" | "desktop-only-canary" | "internal";

export type Capability = {
  key: string;
  /* The top-level feature it belongs to. Sub-features name their parent. */
  feature: Feature;
  parent?: string;
  what: string;
  access: Access;
  routes: string[];
  /* Etsy OAuth scopes, asked for when the member reaches the feature that
     needs them — never all at once at sign-up. */
  etsyScopes: string[];
  needsPrintify: boolean;
  providers: string[];
  /* Keys in the paid-workload registry. Empty means it costs nothing. */
  paidWorkloads: string[];
  /* Tables whose absence means the feature cannot work. */
  tables: string[];
  bindings: string[];
  secrets: string[];
  /* Scheduled work this feature depends on, by cron route. */
  scheduled: string[];
  /* How fresh member-visible data has to be, in seconds. 0 = no requirement. */
  freshnessSeconds: number;
};

export const CAPABILITIES: Capability[] = [
  /* ------------------------------------------------------- Listing Factory */
  {
    key: "listingFactory",
    feature: "listingFactory",
    what: "Bulk Printify-to-Etsy listing creation.",
    access: "desktop-only-canary",
    routes: ["/listing-factory", "/batches", "/api/listing-factory"],
    etsyScopes: ["listings_r", "listings_w", "shops_r"],
    needsPrintify: true,
    providers: ["etsy", "printify", "fal"],
    paidWorkloads: ["listingFamilyCopy", "listingIntelligenceVision",
      "mockupPrintArea", "mockupSegmentation", "imageTransformation"],
    tables: ["publish_identity", "artwork_provenance", "blueprint_mapping_queue"],
    bindings: ["DB", "ARTWORK", "IMAGES"],
    secrets: ["ETSY_API_KEY", "ETSY_API_SECRET", "FAL_KEY"],
    scheduled: [],
    freshnessSeconds: 0,
  },
  {
    key: "trademarkAtPublish",
    feature: "trademarkAtPublish",
    parent: "listingFactory",
    what: "The same trademark check, run before a listing is published.",
    access: "desktop-only-canary",
    routes: ["/api/trademark"],
    etsyScopes: [],
    needsPrintify: false,
    providers: [],
    paidWorkloads: [],
    tables: ["tm_marks", "tm_ingest_files"],
    bindings: ["DB"],
    secrets: [],
    scheduled: ["/api/trademark/ingest-tick"],
    freshnessSeconds: 0,
  },
  {
    key: "artworkCapture",
    feature: "listingFactory",
    parent: "listingFactory",
    what: "Keeps the member's own print file at publish time, privately.",
    access: "canary",
    routes: ["/api/mockups"],
    etsyScopes: [],
    needsPrintify: true,
    providers: ["printify"],
    paidWorkloads: [],
    tables: ["artwork_capture_jobs", "artwork_provenance"],
    bindings: ["DB", "ARTWORK"],
    secrets: [],
    scheduled: [],
    freshnessSeconds: 0,
  },
  /* ----------------------------------------------------------- Design Scanner */
  {
    key: "designScanner",
    feature: "designScanner",
    what: "Compares a design's construction with listings showing verified momentum.",
    access: "canary",
    routes: ["/design-scanner", "/api/design-scanner/scan"],
    etsyScopes: [],
    needsPrintify: false,
    providers: ["fal", "etsy"],
    paidWorkloads: ["designScannerVision", "referenceIngestion"],
    tables: ["scan_uploads", "scan_history", "reference_images", "reference_analysis"],
    bindings: ["DB"],
    secrets: ["FAL_KEY", "ETSY_API_KEY"],
    scheduled: [],
    freshnessSeconds: 6 * 3_600,
  },
  /* -------------------------------------------------------------- Market Watch */
  {
    key: "nicheWatch",
    feature: "marketWatch",
    parent: "marketWatch",
    what: "A saved niche, matched against verified movement every day.",
    access: "canary",
    routes: ["/market-watch", "/api/market-watch/niches"],
    etsyScopes: [],
    needsPrintify: false,
    providers: ["etsy"],
    paidWorkloads: [],
    tables: ["niche_watches", "niche_watch_history", "reference_images",
      "listing_sales_activity"],
    bindings: ["DB"],
    secrets: ["ETSY_API_KEY"],
    scheduled: ["/api/market/sensor-tick", "/api/market/poll-tick", "/api/market/inspect-tick"],
    freshnessSeconds: 6 * 3_600,
  },
  {
    key: "shopWatch",
    feature: "marketWatch",
    parent: "marketWatch",
    what: "What buyers of a watched competitor shop are actually saying.",
    access: "canary",
    routes: ["/api/shop-watch/brief", "/api/market-watch/shops"],
    etsyScopes: [],
    needsPrintify: false,
    providers: ["etsy"],
    paidWorkloads: [],
    tables: ["watched_shops", "member_shop_watches", "shop_reviews", "shop_watch_briefs"],
    bindings: ["DB"],
    secrets: ["ETSY_API_KEY"],
    scheduled: ["/api/market/shop-watch"],
    freshnessSeconds: 24 * 3_600,
  },
  {
    key: "morningUpdate",
    feature: "marketWatch",
    parent: "marketWatch",
    what: "One daily update, and only when something changed.",
    access: "canary",
    routes: ["/api/market-watch/update"],
    etsyScopes: [],
    needsPrintify: false,
    providers: [],
    paidWorkloads: [],
    tables: ["niche_watch_history", "shop_watch_briefs"],
    bindings: ["DB"],
    secrets: [],
    scheduled: [],
    freshnessSeconds: 0,
  },
  /* ------------------------------------------------------------------ Shop Map */
  {
    key: "shopMap",
    feature: "shopMap",
    what: "The member's own listings, money and niches.",
    access: "canary",
    routes: ["/shop-map", "/api/shop-map/map"],
    /*
      SALES ACCESS IS ASKED FOR HERE, AND ONLY HERE.

      `transactions_r` is what reads receipts. A Listing Factory member who
      never opens Shop Map is never asked for it.
    */
    etsyScopes: ["listings_r", "shops_r", "transactions_r"],
    needsPrintify: true,
    providers: ["etsy", "printify", "fal"],
    paidWorkloads: ["nicheClassifier"],
    tables: ["shop_map_listings", "shop_map_listing_sales", "finance_receipts",
      "finance_ledger", "finance_rollups", "shop_map_own_reviews"],
    bindings: ["DB"],
    secrets: ["ETSY_API_KEY", "FAL_KEY"],
    scheduled: [],
    freshnessSeconds: 24 * 3_600,
  },
  /* ----------------------------------------------------------- Trademark Checker */
  {
    key: "trademarkChecker",
    feature: "trademarkStandalone",
    what: "Screening against the federal register and a curated risk list. A checker, not a tracker.",
    access: "everyone",
    routes: ["/trademark", "/api/trademark"],
    etsyScopes: [],
    needsPrintify: false,
    providers: [],
    paidWorkloads: [],
    tables: ["tm_marks", "tm_ingest_files"],
    bindings: ["DB"],
    secrets: [],
    scheduled: ["/api/trademark/ingest-tick"],
    freshnessSeconds: 0,
  },
];

export const capability = (key: string) =>
  CAPABILITIES.find(entry => entry.key === key) ?? null;

export const capabilitiesOf = (feature: Feature) =>
  CAPABILITIES.filter(entry => entry.feature === feature);

/** Every Etsy scope the product can ever need, and which capability needs it. */
export function scopeMap() {
  const scopes = new Map<string, string[]>();
  for (const entry of CAPABILITIES)
    for (const scope of entry.etsyScopes)
      scopes.set(scope, [...(scopes.get(scope) ?? []), entry.key]);
  return [...scopes.entries()].map(([scope, keys]) => ({ scope, neededBy: keys }));
}

/**
 * Things this product deliberately does not have.
 *
 * Written down because each one has been proposed, and two were partly built
 * before being removed. A reader finding no chatbot should be able to tell
 * "not built yet" from "decided against".
 */
export const NOT_IN_GOLDIE = [
  { what: "A chatbot", why: "Not a feature of this product. Removed from scope." },
  { what: "World Builder six-keyword worlds",
    why: "Superseded. Shop Map organizes by flat customer niches; the keyword "
      + "framework categorized products rather than customers and was removed." },
  { what: "Trademark alerts, saved-phrase tracking, filing notifications",
    why: "The Trademark Checker is a checker. Nothing stores a phrase to watch "
      + "it, so no screen may promise an alert." },
  { what: "Trend videos, customer-service bot",
    why: "Not a feature of this product." },
  { what: "Next-move recommendations in Market Watch",
    why: "Market Watch shows evidence. Deciding what to do with it is the seller's job." },
  { what: "Visual artwork matching for the reference corpus",
    why: "Measured and abandoned: the benchmark scored known-positive pairs "
      + "BELOW negatives, so a paid vision pass would have been worse than nothing." },
  { what: "Etsy search results as a cohort source",
    why: "Measured at zero overlap across seven niches. Etsy matches hundreds of "
      + "thousands per phrase; the verified corpus is under a thousand. Cohorts "
      + "are built from the corpus instead." },
];
