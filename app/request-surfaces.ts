/**
 * WHICH CEILING APPLIES TO A REQUEST.
 *
 * Applying limits route by route would mean 144 separate decisions, and the
 * ones that got missed would be invisible — an endpoint is not obviously
 * unbounded by looking at it. So the decision is made in one place, from the
 * method and path, and the LAST rule is a catch-all. Nothing can be left
 * unbounded by forgetting it; a new route inherits the general ceiling until
 * somebody gives it a tighter one.
 *
 * The tighter ceilings are for calls that spend something we do not own:
 * a provider's rate allowance, a member's mailbox, or a irreversible change
 * to their account.
 */
import { LIMITS, type Surface } from "./request-limits.ts";

/** Calls the worker makes to itself on a schedule, which have no caller. */
const INTERNAL = [
  "/api/operations/",
  "/api/market/baseline-tick", "/api/market/poll-tick", "/api/market/sensor-tick",
  "/api/market/inspect-tick", "/api/market/correlate", "/api/market/observe",
  "/api/market/shop-watch", "/api/market/reconcile-pools",
  "/api/shop-map/capture-tick", "/api/trademark/ingest-tick",
  "/api/sold-overnight/cron", "/api/design-scanner/recover-images",
];

/**
 * A scheduled self-call arrives without a client address, because it never
 * crossed the network. That absence is the marker — not a header a caller
 * could set, and not a path a caller could simply request.
 */
export function isInternalCall(request: Request, pathname: string): boolean {
  if (request.headers.get("cf-connecting-ip")) return false;
  return INTERNAL.some(prefix => pathname.startsWith(prefix));
}

type Rule = { match: RegExp; methods?: string[]; surface: Surface };

/* Ordered: the first match wins, so the tighter rules are listed first. */
const RULES: Rule[] = [
  /* Anything that accepts a file or an inline image. */
  { match: /^\/api\/(etsy\/images|support|design-scanner\/scan|listing-photos\/delivery|product-recipes\/photos)$/,
    methods: ["POST", "PUT"], surface: "upload/attempt" },
  { match: /^\/api\/mockups\/library\/[^/]+\/(occlusion|prepare|image)$/,
    methods: ["POST", "PUT"], surface: "upload/attempt" },

  /* Irreversible, and cheap to ask for. */
  { match: /^\/api\/account\/delete$/, surface: "account/delete" },

  /* Sign-in and connection handshakes. A link request reaches a real mailbox. */
  { match: /^\/api\/mastermind\/redeem$/, surface: "auth/sign-in" },
  { match: /^\/api\/etsy\/callback$/, surface: "auth/oauth-callback" },
  { match: /^\/api\/(etsy|connections\/printify)$/, methods: ["POST", "PUT", "DELETE"],
    surface: "auth/oauth-start" },

  /* Provider allowances: writes are scarcer than reads and are bounded tighter. */
  { match: /^\/api\/etsy(\/|-|$)/, methods: ["POST", "PUT", "PATCH", "DELETE"],
    surface: "provider/etsy-write" },
  { match: /^\/api\/etsy(\/|-|$)/, surface: "provider/etsy-read" },
  { match: /^\/api\/printify\/drafts\/(publish|update)$/, surface: "provider/printify-write" },
  { match: /^\/api\/printify(\/|$)/, methods: ["POST", "PUT", "PATCH", "DELETE"],
    surface: "provider/printify-write" },
  { match: /^\/api\/(printify|shop-map\/printify-)/, surface: "provider/printify-read" },

  /* Money in, and the reconciliation that reads it back. */
  { match: /^\/api\/shop-map\/(financial\/ingest|connect-sales)$/, surface: "finance/ingest" },
  { match: /^\/api\/(shop-map\/(financial\/reconcile|reconcile)|market\/reconcile-pools)$/,
    surface: "finance/reconcile" },

  /* Discovery is expensive upstream even when it is not billed to us. */
  { match: /^\/api\/(market\/discover|market-watch\/niches|design-scanner\/niche-probe|whats-selling|sold-overnight\/search)$/,
    surface: "niche/discover" },
  { match: /^\/api\/(market-watch\/update|shop-watch\/|market\/shop-watch|keyword-lists)/,
    methods: ["POST", "PUT", "DELETE"], surface: "watch/create" },

  /* Owner-only tooling. Bounded so a leaked session cannot be used at speed. */
  { match: /^\/api\/(mastermind\/admin|dev\/|launch-check|.*\/(override-)?audit$|uspto-|.*-probe$|.*-forensics$|.*-canary$|.*-diagnostic$)/,
    surface: "owner/tools" },

  /* Reports, which are unauthenticated by necessity. */
  { match: /^\/api\/(client-errors|csp-report)$/, surface: "report/browser" },
];

/**
 * The ceiling for this request.
 *
 * Never null: a path with no rule of its own still gets the general ceiling,
 * which is high enough that no screen in the product can reach it and low
 * enough that a script cannot run unbounded.
 */
export function surfaceFor(method: string, pathname: string): Surface {
  const verb = method.toUpperCase();
  for (const rule of RULES)
    if (rule.match.test(pathname) && (!rule.methods || rule.methods.includes(verb)))
      return rule.surface;
  return "read/general";
}

/** Every surface the classifier can return has a number attached to it. */
export function everySurfaceHasALimit(): boolean {
  return RULES.every(rule => rule.surface in LIMITS) && "read/general" in LIMITS;
}
