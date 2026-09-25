/**
 * WHAT LEAVES, AND WHAT STAYS, WHEN SOMETHING IS REMOVED.
 *
 * Every removal in Goldie falls into one of three shapes, and confusing them
 * is how a member loses history they wanted or keeps data they asked to be rid
 * of:
 *
 *   REMOVED    — the member's own data. Gone.
 *   RETIRED    — kept, but inert. An Etsy connection is never hard-deleted:
 *                the row stays so it can be reconnected and so the audit trail
 *                survives, with its token cleared so it cannot publish.
 *   SHARED     — not the member's to delete. A public shop's review history
 *                belongs to the shared collection; one member unwatching it
 *                must not destroy it for everyone else.
 *
 * Nothing here executes. It describes, so a member can be shown exactly what
 * will happen BEFORE they confirm, and so the executing code and the
 * explanation cannot drift apart — both read this.
 */
export type Disposition = "removed" | "retired" | "shared-kept";

export type Effect = {
  what: string;
  disposition: Disposition;
  /* Said to the member, in their words, not ours. */
  say: string;
};

export type Action =
  | "account-deletion" | "etsy-disconnect" | "printify-disconnect"
  | "delete-scan" | "delete-artwork" | "remove-niche-watch" | "remove-shop-watch";

export const EFFECTS: Record<Action, Effect[]> = {
  "account-deletion": [
    { what:"niche_research_projects, niche_research_evidence", disposition:"removed", say:"Your niche panels, research evidence and monitoring history." },
    { what: "scan_uploads, scan_history", disposition: "removed",
      say: "Your design scans and their results." },
    { what: "artwork_provenance, ARTWORK objects", disposition: "removed",
      say: "Every print file captured for you." },
    { what: "niche_watches, market_keyword_collections", disposition: "removed",
      say: "Your tracked keywords and saved comparisons. Public marketplace information is retained." },
    { what: "member_shop_watches", disposition: "removed",
      say: "The shops you follow." },
    { what: "shop_map_listings, finance_*", disposition: "removed",
      say: "Your Shop Map, including your sales and profit figures." },
    { what: "etsy_connections, printify_connections", disposition: "retired",
      say: "Your Etsy and Printify connections are switched off and their access "
        + "keys destroyed. The record that they existed is kept, because it is "
        + "what proves nothing published after you left." },
    { what: "watched_shops, shop_reviews, listing_sales_activity",
      disposition: "shared-kept",
      say: "Public marketplace data other members also rely on is not yours to "
        + "remove, and none of it identifies you." },
  ],
  "etsy-disconnect": [
    { what: "etsy_connections.encrypted_access_token", disposition: "retired",
      say: "The platform stops reading or publishing to this shop straight away. Your "
        + "Etsy listings are not touched." },
    { what: "shop_map_listings, finance_*", disposition: "shared-kept",
      say: "What was already recorded about this shop is kept, so reconnecting "
        + "later picks up where it left off." },
  ],
  "printify-disconnect": [
    { what: "printify_connections.encrypted_token", disposition: "retired",
      say: "The Listing Factory stops being able to build listings, and Shop Map "
        + "can no longer work out what new orders cost you to make." },
    { what: "artwork_provenance", disposition: "shared-kept",
      say: "Print files already captured stay yours." },
  ],
  "delete-scan": [
    { what: "scan_history row", disposition: "removed", say: "This scan and its result." },
    { what: "scan_uploads row", disposition: "removed",
      say: "The analysis of this design. Scanning it again would cost a scan." },
    { what: "reference_analysis", disposition: "shared-kept",
      say: "The anonymous design patterns it was compared against are market "
        + "data and stay." },
  ],
  "delete-artwork": [
    { what: "ARTWORK object, artwork_provenance", disposition: "removed",
      say: "The print file and the record of which listing it belongs to." },
  ],
  "remove-niche-watch": [
    { what: "niche_watches row", disposition: "removed",
      say: "You stop following this niche." },
    { what: "niche_watch_history", disposition: "shared-kept",
      say: "The evidence gathered is market data. If you watch this niche "
        + "again it will not start from nothing." },
  ],
  "remove-shop-watch": [
    { what: "member_shop_watches row", disposition: "removed",
      say: "You stop following this shop." },
    { what: "watched_shops, shop_reviews", disposition: "shared-kept",
      say: "The shop's public history stays, because other members may be "
        + "following it too." },
  ],
};

export const describe = (action: Action) => EFFECTS[action] ?? [];

export const willBeRemoved = (action: Action) =>
  describe(action).filter(effect => effect.disposition === "removed");

/** A removal is never executed from a description alone. */
export const CONFIRMATION_REQUIRED: Action[] = ["account-deletion", "delete-artwork"];

/**
 * Housekeeping windows.
 *
 * A reservation that was never settled holds budget nothing will spend, and an
 * OAuth handle that never expires is a handle somebody can find later.
 */
export const STALE_RESERVATION_SECONDS = 3_600;
export const OAUTH_STATE_SECONDS = 15 * 60;
export const TARGET_HANDLE_SECONDS = 10 * 60;
