import type { Feature } from "@/app/suite-plans";

/**
 * EVERY MEMBER-FACING ROUTE, AND WHO MAY REACH IT.
 *
 * The rule this encodes: hiding a link is not access control. A member without
 * Design Scanner must be refused when they type the URL, and refused again
 * when they call the API directly.
 *
 * Four kinds of entry:
 *
 *   feature  — needs that feature's entitlement.
 *   open     — reachable by any signed-in account, entitlement or not. This is
 *              deliberately short: account, connections, sign-out, OAuth
 *              return, and the upgrade screen. Gating these is how somebody
 *              locks themselves out of the screen that would fix their
 *              connection, or cannot sign out of an expired account.
 *   public   — no sign-in at all (sign-in itself, the OAuth callback).
 *   owner    — internal. Never a member route.
 *
 * A NEW ROUTE WITH NO ENTRY FAILS THE TEST. That is the point: the matrix is
 * the place access is decided, and a route that forgot to decide is a route
 * that defaults to something nobody chose.
 */
export type Rule =
  | { kind: "feature"; feature: Feature }
  | { kind: "open" }
  | { kind: "public" }
  | { kind: "owner" };

export const ACCESS: Record<string, Rule> = {
  /* ---------------------------------------------------------------- public */
  "/account/sign-in": { kind: "public" },
  "/signup": { kind: "public" },
  "/api/etsy/callback": { kind: "public" },
  "/auth/callback": { kind: "public" },
  "/api/client-errors": { kind: "public" },
  "/api/version": { kind: "public" },
  /* Measured, not assumed: /api/trademark answers 401 to a signed-out caller,
     so it is `open` — any signed-in account, no plan — rather than public.
     The matrix has to say what the route does, or it is a second status list
     that disagrees with the first. */
  "/api/trademark/register-status": { kind: "public" },

  /* ------------------------------------------------------------------ open */
  /* Signing out, repairing a connection and seeing what you are paying for
     must never require a plan. */
  "/account/sign-out": { kind: "open" },
  "/home": { kind: "open" },
  "/more": { kind: "open" },
  "/connections": { kind: "open" },
  "/usage": { kind: "open" },
  "/api/home": { kind: "open" },
  "/api/account": { kind: "open" },
  "/api/account/data": { kind: "open" },
  "/api/access/status": { kind: "open" },
  "/api/usage": { kind: "open" },
  "/api/connections/printify": { kind: "open" },
  "/trademark": { kind: "open" },
  "/api/trademark": { kind: "open" },
  "/api/shop-map/connections": { kind: "open" },
  "/api/shop-map/connect-sales": { kind: "open" },
  "/api/etsy": { kind: "open" },
  "/api/etsy/active": { kind: "open" },
  "/api/printify": { kind: "open" },
  "/api/billing/status": { kind: "open" },
  "/api/billing/checkout": { kind: "open" },
  "/api/billing/portal": { kind: "open" },
  "/api/billing/webhook": { kind: "public" },

  /* -------------------------------------------------------- Listing Factory */
  "/listing-factory": { kind: "feature", feature: "listingFactory" },
  "/listingfactory": { kind: "feature", feature: "listingFactory" },
  "/batches": { kind: "feature", feature: "listingFactory" },
  "/keywords": { kind: "feature", feature: "listingFactory" },
  "/goals": { kind: "feature", feature: "listingFactory" },
  "/mockups": { kind: "feature", feature: "listingFactory" },
  "/design-lab": { kind: "feature", feature: "listingFactory" },
  "/drop": { kind: "feature", feature: "listingFactory" },
  "/api/batches": { kind: "feature", feature: "listingFactory" },
  "/api/printify/drafts": { kind: "feature", feature: "listingFactory" },
  "/api/printify/drafts/publish": { kind: "feature", feature: "listingFactory" },
  "/api/printify/drafts/update": { kind: "feature", feature: "listingFactory" },
  "/api/printify/drafts/verify": { kind: "feature", feature: "listingFactory" },
  "/api/printify/stage": { kind: "feature", feature: "listingFactory" },
  "/api/listing-intelligence": { kind: "feature", feature: "listingFactory" },
  "/api/product-bundles": { kind: "feature", feature: "listingFactory" },
  "/api/product-recipes": { kind: "feature", feature: "listingFactory" },
  "/api/product-recipes/photos": { kind: "feature", feature: "listingFactory" },
  "/api/seller-preferences": { kind: "feature", feature: "listingFactory" },
  "/api/keyword-lists": { kind: "feature", feature: "listingFactory" },
  "/api/mockups/library": { kind: "feature", feature: "listingFactory" },
  "/api/mockups/analyze": { kind: "feature", feature: "listingFactory" },
  "/api/mockups/placement": { kind: "feature", feature: "listingFactory" },
  "/api/mockups/print-area": { kind: "feature", feature: "listingFactory" },
  "/api/listing-photos/delivery": { kind: "feature", feature: "listingFactory" },
  "/api/listing-photos/download": { kind: "feature", feature: "listingFactory" },
  "/api/etsy/taxonomy": { kind: "feature", feature: "listingFactory" },
  "/api/etsy/shipping-profiles": { kind: "feature", feature: "listingFactory" },
  "/api/etsy/production-partners": { kind: "feature", feature: "listingFactory" },
  "/api/etsy/images": { kind: "feature", feature: "listingFactory" },
  "/api/etsy-capability": { kind: "feature", feature: "listingFactory" },
  "/api/unlocks": { kind: "feature", feature: "listingFactory" },
  "/api/drop": { kind: "feature", feature: "listingFactory" },

  /* --------------------------------------------------------- Design Scanner */
  "/design-scanner": { kind: "feature", feature: "designScanner" },
  "/api/design-scanner/scan": { kind: "feature", feature: "designScanner" },

  /* ------------------------------------------------------------ Market Watch */
  "/market-watch": { kind: "feature", feature: "marketWatch" },
  "/api/market-watch/niches": { kind: "feature", feature: "marketWatch" },
  "/api/market-watch/shops": { kind: "feature", feature: "marketWatch" },
  "/api/market-watch/update": { kind: "feature", feature: "marketWatch" },
  "/api/shop-watch/brief": { kind: "feature", feature: "marketWatch" },
  "/hot-list": { kind: "feature", feature: "marketWatch" },
  "/sold-overnight": { kind: "feature", feature: "marketWatch" },
  "/api/sold-overnight": { kind: "feature", feature: "marketWatch" },
  "/api/sold-overnight/search": { kind: "feature", feature: "marketWatch" },
  "/api/whats-selling": { kind: "feature", feature: "marketWatch" },

  /* ---------------------------------------------------------------- Shop Map */
  "/shop-map": { kind: "feature", feature: "shopMap" },
  "/api/shop-map/map": { kind: "feature", feature: "shopMap" },
  "/api/shop-map/listings": { kind: "feature", feature: "shopMap" },
  "/api/shop-map/correct": { kind: "feature", feature: "shopMap" },
  "/api/shop-map/classify": { kind: "feature", feature: "shopMap" },
  "/api/shop-map/classify/repair": { kind: "feature", feature: "shopMap" },
  "/api/shop-map/financial": { kind: "feature", feature: "shopMap" },
  "/api/shop-map/financial/ingest": { kind: "feature", feature: "shopMap" },
  "/api/shop-map/financial/settings": { kind: "feature", feature: "shopMap" },
  "/api/shop-map/financial/reconcile": { kind: "feature", feature: "shopMap" },
  "/api/shop-map/unclassified": { kind: "feature", feature: "shopMap" },
  "/api/shop-map/capability": { kind: "feature", feature: "shopMap" },
  "/api/shop-map/provenance": { kind: "feature", feature: "shopMap" },
  "/api/shop-map/production-cost": { kind: "feature", feature: "shopMap" },
  "/api/shop-map/printify-shops": { kind: "feature", feature: "shopMap" },
  "/api/launch-check": { kind: "feature", feature: "shopMap" },
  "/launch-check": { kind: "feature", feature: "shopMap" },
};

/**
 * Owner-only. Listed by prefix because the internal surface is a tree, and a
 * new diagnostic route under one of these must not silently become a member
 * route.
 */
export const OWNER_PREFIXES = [
  "/api/operations", "/operations",
  "/api/mastermind", "/mastermind", "/mastermind-admin", "/mastermind-beta",
  "/api/market/",                     /* cron and detector controls */
  "/api/market-watch/budget",         /* capacity model, not a member view */
  "/api/market/correlate", "/api/market/observe", "/api/market/discover",
  "/api/market/backlog-audit",
  "/api/design-scanner/corpus", "/api/design-scanner/recover-images",
  "/api/design-scanner/analyze-references", "/api/design-scanner/niche-probe",
  "/api/design-scanner/precision-audit", "/api/design-scanner/review-audit",
  "/api/design-scanner/cohort-reviews",
  "/api/shop-map/reconcile", "/api/shop-map/linkage", "/api/shop-map/artwork-audit",
  "/api/shop-map/artwork-coverage", "/api/shop-map/auth-diagnostic",
  "/api/shop-map/benchmark-candidates", "/api/shop-map/benchmark-printify",
  "/api/shop-map/connection-forensics", "/api/shop-map/financial-survey",
  "/api/shop-map/financial/audit", "/api/shop-map/image-id-test",
  "/api/shop-map/printify-probe", "/api/shop-map/printify-audit",
  "/api/shop-map/capture-tick",
  "/api/trademark/ingest-tick", "/api/listing-factory/",
  "/api/sold-overnight/cron", "/api/sold-overnight/build",
  "/api/uspto-", "/api/stock-probe", "/api/shop-proof", "/api/support",
  "/api/printify/diagnostics", "/api/shop-watch/live-proof",
  "/api/mockups/library/", "/api/printify/staged/",
];

export const isOwnerRoute = (route: string) =>
  OWNER_PREFIXES.some(prefix => route.startsWith(prefix));

export const ruleFor = (route: string): Rule | null =>
  isOwnerRoute(route) ? { kind: "owner" } : ACCESS[route] ?? null;
