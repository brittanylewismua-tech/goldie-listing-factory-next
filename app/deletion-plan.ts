/**
 * THE DELETION PLAN, DECIDED IN ONE PLACE.
 *
 * Deleting an account is the one irreversible thing a member can ask for, so
 * the plan is a value: it can be shown to them, executed, and tested, and all
 * three read the same list.
 *
 * THREE DISPOSITIONS, AND THEY ARE NOT INTERCHANGEABLE:
 *
 *   delete  — the member's own rows. Gone.
 *   retire  — a row that survives with its secret destroyed. An Etsy
 *             connection is never dropped: the record that it existed is what
 *             proves nothing published after they left, and it is what lets
 *             them come back.
 *   keep    — shared public market evidence. It is not theirs to delete, it
 *             identifies nobody, and removing it would damage every other
 *             member watching the same niche.
 *
 * R2 ARTWORK IS THE ONE THING THAT NEEDS CARE. Two rows belonging to the same
 * member can reference one object — the same design published across twenty
 * products — so an object is removed only when the last row referencing it
 * goes with it. Deleting per row would delete artwork still in use.
 */
export type Disposition = "delete" | "retire" | "keep";

export type PlanStep = {
  table: string;
  disposition: Disposition;
  /* SQL applied with the member's id as the only bound parameter. */
  sql: string;
  say: string;
};

export const DELETION_PLAN: PlanStep[] = [
  {table:"niche_research_evidence",disposition:"delete",sql:"DELETE FROM niche_research_evidence WHERE user_id = ?",say:"Your niche research evidence."},
  {table:"niche_research_projects",disposition:"delete",sql:"DELETE FROM niche_research_projects WHERE user_id = ?",say:"Your niche panels and monitoring history."},
  { table: "market_keyword_collections", disposition: "delete",
    sql: `DELETE FROM market_keyword_collections WHERE user_id = ?`,
    say: "Your saved competitor comparisons." },
  { table: "command_center_plans", disposition: "delete",
    sql: `DELETE FROM command_center_plans WHERE user_id = ?`,
    say: "Your Command Center plans, experiments and results." },
  { table: "scan_history", disposition: "delete",
    sql: `DELETE FROM scan_history WHERE user_id = ?`,
    say: "Your design scans and their results." },
  { table: "scan_uploads", disposition: "delete",
    sql: `DELETE FROM scan_uploads WHERE user_id = ?`,
    say: "The stored analysis of each design you scanned." },
  { table: "niche_watches", disposition: "delete",
    sql: `DELETE FROM niche_watches WHERE user_id = ?`,
    say: "The niches you were watching." },
  { table: "member_shop_watches", disposition: "delete",
    sql: `DELETE FROM member_shop_watches WHERE user_id = ?`,
    say: "The shops you were following." },
  { table: "shop_map_listings", disposition: "delete",
    sql: `DELETE FROM shop_map_listings WHERE user_id = ?`,
    say: "Your Shop Map, and the niches your listings were organised into." },
  { table: "shop_map_shop_profiles", disposition: "delete",
    sql: `DELETE FROM shop_map_shop_profiles WHERE user_id = ?`,
    say: "The shop name and profile image shown in your Shop Map." },
  { table: "trademark_watches", disposition: "delete",
    sql: `DELETE FROM trademark_watches WHERE user_id = ?`,
    say: "The phrases you asked the Trademark Tracker to watch." },
  { table: "shop_map_listing_sales", disposition: "delete",
    sql: `DELETE FROM shop_map_listing_sales WHERE user_id = ?`,
    say: "Your per-listing sales history held here." },
  { table: "finance_receipts", disposition: "delete",
    sql: `DELETE FROM finance_receipts WHERE user_id = ?`,
    say: "Your order and revenue records." },
  { table: "finance_ledger", disposition: "delete",
    sql: `DELETE FROM finance_ledger WHERE user_id = ?`,
    say: "Your Etsy fee records." },
  { table: "finance_rollups", disposition: "delete",
    sql: `DELETE FROM finance_rollups WHERE user_id = ?`,
    say: "Your monthly profit figures." },
  { table: "artwork_provenance", disposition: "delete",
    sql: `DELETE FROM artwork_provenance WHERE user_id = ?`,
    say: "The record of which print file belongs to which listing." },
  { table: "publish_identity", disposition: "delete",
    sql: `DELETE FROM publish_identity WHERE user_id = ?`,
    say: "Your listing batches." },

  /*
    RETIRED, NOT DROPPED. The token is destroyed so the connection cannot act;
    the row remains so the audit trail is intact and a return is possible.
  */
  { table: "etsy_connections", disposition: "retire",
    sql: `UPDATE etsy_connections
             SET encrypted_access_token = '', encrypted_refresh_token = '', is_active = 0
           WHERE user_id = ?`,
    say: "Your Etsy connection is switched off and its access keys destroyed. "
      + "This software can no longer read or publish to your shop." },
  { table: "printify_connections", disposition: "retire",
    sql: `UPDATE printify_connections SET encrypted_token = '' WHERE user_id = ?`,
    say: "Your Printify connection is switched off and its key destroyed." },
  { table: "member_entitlements", disposition: "retire",
    sql: `UPDATE member_entitlements SET state = 'none', plan = NULL WHERE user_id = ?`,
    say: "Your access to these features ends." },

  /*
    D1640 · TWENTY-SIX TABLES HOLDING A MEMBER'S ROWS WERE NOT IN THIS PLAN.

    The plan covered twelve of the thirty-eight tables keyed by user_id. A
    member who deleted their account kept their entire Shop Map and every
    classification in it, every mockup template and scene they had set up,
    their listing batches, their finance settings, production costs and
    adjustments, their design intelligence and their artwork capture queue.

    The plan was correct about everything it named and silent about most of
    what existed, which is the worst shape for a promise like this one. A
    test now walks every CREATE TABLE in the codebase and refuses any table
    with a user_id column that is neither in this list nor in NOT_MEMBER_DATA
    below with a reason, so a table added later cannot quietly escape.
  */
  { table: "shop_map_classifications", disposition: "delete",
    sql: `DELETE FROM shop_map_classifications WHERE user_id = ?`,
    say: "How your listings were classified into niches." },
  { table: "shop_map_niche_list", disposition: "delete",
    sql: `DELETE FROM shop_map_niche_list WHERE user_id = ?`,
    say: "The niche list built for your shop." },
  { table: "shop_map_niche_repairs", disposition: "delete",
    sql: `DELETE FROM shop_map_niche_repairs WHERE user_id = ?`,
    say: "Your corrections to that niche list." },
  { table: "shop_map_world_labels", disposition: "delete",
    sql: `DELETE FROM shop_map_world_labels WHERE user_id = ?`,
    say: "The names you gave your niches." },
  { table: "shop_map_world_overrides", disposition: "delete",
    sql: `DELETE FROM shop_map_world_overrides WHERE user_id = ?`,
    say: "The listings you moved between niches by hand." },
  { table: "connection_cleanup_queue", disposition: "delete",
    sql: `DELETE FROM connection_cleanup_queue WHERE user_id = ?`,
    say: "Notes about a shop connection that stopped working." },
  { table: "shop_map_cost_rules", disposition: "delete",
    sql: `DELETE FROM shop_map_cost_rules WHERE user_id = ?`,
    say: "Your production cost rules." },
  { table: "shop_map_own_reviews", disposition: "delete",
    sql: `DELETE FROM shop_map_own_reviews WHERE user_id = ?`,
    say: "The reviews read from your own shop." },
  { table: "shop_map_auth_targets", disposition: "delete",
    sql: `DELETE FROM shop_map_auth_targets WHERE user_id = ?`,
    say: "Which of your shops Shop Map was reading." },
  { table: "request_limits", disposition: "delete",
    sql: `DELETE FROM request_limits WHERE user_id = ?`,
    say: "The short-lived counters that pace how often the app calls out for you." },

  { table: "finance_shop_settings", disposition: "delete",
    sql: `DELETE FROM finance_shop_settings WHERE user_id = ?`,
    say: "Your shop's finance settings, including its timezone." },
  { table: "finance_sources", disposition: "delete",
    sql: `DELETE FROM finance_sources WHERE user_id = ?`,
    say: "Where each figure in your finances came from." },
  { table: "finance_windows", disposition: "delete",
    sql: `DELETE FROM finance_windows WHERE user_id = ?`,
    say: "Which periods had been read from Etsy." },
  { table: "finance_production", disposition: "delete",
    sql: `DELETE FROM finance_production WHERE user_id = ?`,
    say: "Your production costs." },
  { table: "finance_adjustments", disposition: "delete",
    sql: `DELETE FROM finance_adjustments WHERE user_id = ?`,
    say: "Adjustments you made to your figures by hand." },

  { table: "listing_batches", disposition: "delete",
    sql: `DELETE FROM listing_batches WHERE user_id = ?`,
    say: "Your saved Listing Factory batches and their contents." },
  { table: "listing_family_copy", disposition: "delete",
    sql: `DELETE FROM listing_family_copy WHERE user_id = ?`,
    say: "The titles and tags written for your product families." },
  { table: "design_intelligence", disposition: "delete",
    sql: `DELETE FROM design_intelligence WHERE user_id = ?`,
    say: "What was understood about each design you uploaded." },
  { table: "artwork_capture_jobs", disposition: "delete",
    sql: `DELETE FROM artwork_capture_jobs WHERE user_id = ?`,
    say: "Artwork still queued to be saved." },

  { table: "mockup_templates", disposition: "delete",
    sql: `DELETE FROM mockup_templates WHERE user_id = ?`,
    say: "Your mockup templates." },
  { table: "mockup_scene_geometry", disposition: "delete",
    sql: `DELETE FROM mockup_scene_geometry WHERE user_id = ?`,
    say: "Where the artwork sits in each of your mockup scenes." },
  { table: "mockup_artwork_overrides", disposition: "delete",
    sql: `DELETE FROM mockup_artwork_overrides WHERE user_id = ?`,
    say: "Your per-mockup artwork choices." },
  { table: "mockup_set_preferences", disposition: "delete",
    sql: `DELETE FROM mockup_set_preferences WHERE user_id = ?`,
    say: "Your mockup set preferences." },
  { table: "mockup_analysis_cache", disposition: "delete",
    sql: `DELETE FROM mockup_analysis_cache WHERE user_id = ?`,
    say: "The stored analysis of your mockup images." },

  { table: "feature_canary", disposition: "delete",
    sql: `DELETE FROM feature_canary WHERE user_id = ?`,
    say: "Which early features you were switched on for." },

  /*
    UNLINKED RATHER THAN DELETED.

    Three records have to survive and must not stay attached to a person.
    The spend ledger is what enforces every daily and global cost ceiling —
    deleting rows from it would corrupt the accounting that protects the
    product's own spending. The error log and the vision telemetry are the
    same shape: keep the event, lose the identity.
  */
  { table: "spend_reservations", disposition: "retire",
    sql: `UPDATE spend_reservations SET user_id = '' WHERE user_id = ?`,
    say: "The record of what your work cost is unlinked from you. The cost "
      + "figures remain, attached to nobody." },
  /* Printify call telemetry carries a member id so traffic can be attributed
     while they are here. It is not accounting — no money hangs off it — so the
     identity goes and the shape of the traffic stays. */
  { table: "printify_api_calls", disposition: "retire",
    sql: `UPDATE printify_api_calls SET user_id = '' WHERE user_id = ?`,
    say: "Records of calls made to your print provider on your behalf are "
      + "unlinked from you." },
  { table: "vision_calls", disposition: "retire",
    sql: `UPDATE vision_calls SET user_id = '' WHERE user_id = ?`,
    say: "Analysis usage records are unlinked from you." },
  { table: "error_log", disposition: "retire",
    sql: `UPDATE error_log SET user_id = NULL WHERE user_id = ?`,
    say: "Any error recorded while you were using this is unlinked from you." },

  /*
    D1641 · FOUND BY WIDENING THE SEARCH FROM "CREATE TABLE" TO "QUERIED WITH
    A user_id".

    Eleven more tables hold a member's rows and are created by migration
    rather than by a CREATE TABLE in this codebase, so the first completeness
    scan could not see them at all — including photo_deliveries, the whole
    Listing Factory publish queue, and every keyword bank a member built.
  */
  { table: "keyword_lists", disposition: "delete",
    sql: `DELETE FROM keyword_lists WHERE user_id = ?`,
    say: "Your keyword banks." },
  { table: "product_recipes", disposition: "delete",
    sql: `DELETE FROM product_recipes WHERE user_id = ?`,
    say: "Your saved product recipes." },
  { table: "etsy_publish_jobs", disposition: "delete",
    sql: `DELETE FROM etsy_publish_jobs WHERE user_id = ?`,
    say: "Anything still queued to publish to Etsy." },
  { table: "etsy_publish_items", disposition: "delete",
    sql: `DELETE FROM etsy_publish_items WHERE user_id = ?`,
    say: "The individual listings in those queues." },
  { table: "etsy_listing_links", disposition: "delete",
    sql: `DELETE FROM etsy_listing_links WHERE user_id = ?`,
    say: "The links between your products and your Etsy listings." },
  { table: "printify_batch_sessions", disposition: "delete",
    sql: `DELETE FROM printify_batch_sessions WHERE user_id = ?`,
    say: "Your Printify batch sessions." },
  { table: "printify_draft_results", disposition: "delete",
    sql: `DELETE FROM printify_draft_results WHERE user_id = ?`,
    say: "The results of each draft created for you." },
  { table: "printify_diagnostics", disposition: "delete",
    sql: `DELETE FROM printify_diagnostics WHERE user_id = ?`,
    say: "Diagnostic records kept while your batches ran." },
  { table: "photo_deliveries", disposition: "delete",
    sql: `DELETE FROM photo_deliveries WHERE user_id = ?`,
    say: "Your listing photo deliveries." },
  { table: "shop_pairing_proofs", disposition: "delete",
    sql: `DELETE FROM shop_pairing_proofs WHERE user_id = ?`,
    say: "The proof used to pair your Etsy and Printify shops." },
  { table: "etsy_listing_usage", disposition: "retire",
    sql: `UPDATE etsy_listing_usage SET user_id = '' WHERE user_id = ?`,
    say: "Records of how much of the Etsy allowance your work used are "
      + "unlinked from you." },
];

/*
  KEPT, AND THE MEMBER IS TOLD WHY.

  Billing records are not the member's to delete and this product is not free
  to delete them: they are the record of money that changed hands, they have
  to reconcile with Stripe, and they are kept for the period the law requires.
  Saying so plainly is better than a deletion that quietly leaves them and
  better than one that quietly breaks the books.
*/
export const KEPT_BY_LAW: Array<{ table: string; say: string }> = [
  { table: "billing_customers",
    say: "Your billing record with the payment processor." },
  { table: "billing_subscriptions",
    say: "The record of what you subscribed to and when." },
  { table: "billing_trials", say: "The record of any trial you were given." },
  { table: "account_plans", say: "The record of which plan you held." },
  { table: "trial_reminder_emails",
    say: "The record of trial reminders that were sent to you." },
];


/*
  TABLES WITH A user_id THAT ARE DELIBERATELY NOT MEMBER DATA.

  Every one needs a reason here, and the completeness test refuses a table
  that is in neither list. An empty exemption list would be better; these are
  the ones that genuinely are not the member's to remove.
*/
export const NOT_MEMBER_DATA: Array<{ table: string; why: string }> = [
  { table: "entitlement_audit",
    why: "An append-only record of who was granted what and when. Its whole "
      + "purpose is that it cannot be edited after the fact, including by "
      + "the person it concerns." },
  { table: "admin_actions",
    why: "The same: an append-only record of operator actions." },
  { table: "account_deletions",
    why: "The audit of this deletion. Deleting it would erase the proof that "
      + "the deletion happened." },
  { table: "mastermind_access",
    why: "Operator access grants. Not the member's own record and not theirs "
      + "to remove; an access grant that could be erased by its subject is "
      + "not an access record." },
  { table: "etsy_connection_events",
    why: "The append-only log of every connect and disconnect. It is what "
      + "shows nothing was published after the member left, which is the "
      + "point of retiring the connection rather than dropping it." },
  { table: "etsy_oauth_states",
    why: "Short-lived one-time values for an authorisation handshake in "
      + "progress. They expire on their own and identify no one afterwards." },
]
  /* Billing rows are accounted for by KEPT_BY_LAW, which states each one to
     the member rather than leaving it to be discovered. */
  .concat(KEPT_BY_LAW.map(entry => ({ table: entry.table,
    why: "A billing record, kept for the period the law requires and stated "
      + "to the member: " + entry.say })));


/*
  STORED FILES, WHICH ARE NOT ROWS AND WERE NOT IN THE PLAN.

  The header above has always said R2 artwork "needs care", and no step ever
  touched it: a member could delete their account and their uploaded print
  files stayed in the bucket. The care it needs turned out to be already
  designed in — every object is keyed by member, so identical artwork held by
  two members is two objects and neither can name the other's:

    provenance/<member>/<hash>.png
    etsy-listing-images/<member>/<product>/...
    photo-delivery/<member>/<delivery>/...

  which makes removal a prefix delete that cannot reach anybody else's file.
*/
export const OBJECT_PREFIXES: Array<{ prefix: string; say: string }> = [
  { prefix: "provenance/", say: "The print files you uploaded." },
  { prefix: "etsy-listing-images/", say: "The listing images prepared for your shop." },
  { prefix: "photo-delivery/", say: "The photo deliveries prepared for your listings." },
  /*
    D1725 · Five prefixes that were keyed by the member's own id and were not
    on this list, so account deletion left their files in storage. Each holds
    something they made: the templates they saved, the working files and
    images from batches they ran, the mockup scenes they prepared and the
    masks they edited.

    The table list has been complete for a long time because a test insists on
    it. There was no equivalent test for objects, so this was invisible.
  */
  { prefix: "batch-templates/", say: "The batch templates you saved." },
  { prefix: "draft-jobs/", say: "The working files from listing batches you ran." },
  { prefix: "draft-media/", say: "The images held while your drafts were being built." },
  { prefix: "mockup-library/", say: "The mockup scenes you prepared." },
  { prefix: "mockup-occlusion/", say: "The mockup masks you edited." },
];

/** Not touched, and why — shown to the member rather than left to be noticed. */
export const KEPT = [
  { what: "Listings, reviews and movement observed on public Etsy shops",
    why: "This is public marketplace evidence that other members' watches rely "
      + "on. It was never about you and it does not identify you." },
  { what: "The record that your connection existed",
    why: "Its keys are destroyed, so it cannot act. The row is what shows "
      + "nothing was published after you left." },
  { what: "Anonymous design-construction patterns",
    why: "They describe how designs are built, carry no wording or subject "
      + "matter, and are not linked to you." },
];

/* The phrase a member types to confirm deletion. It named the old product;
   what it has to be is unmistakable and hard to type by accident, which it
   still is. */
export const CONFIRMATION_PHRASE = "DELETE MY DATA";

/** How recent a sign-in has to be for this to be allowed. */
export const RECENT_AUTH_SECONDS = 15 * 60;

export const stepsFor = (disposition: Disposition) =>
  DELETION_PLAN.filter(step => step.disposition === disposition);

/**
 * Validate a request before anything runs.
 *
 * Every reason to refuse is checked here, so the executing code has one
 * decision to make and the member gets one clear answer.
 */
export function mayDelete(
  { phrase, authenticatedAt, now }:
  { phrase: string; authenticatedAt: number; now: number },
): { ok: true } | { ok: false; because: string } {
  if (phrase.trim() !== CONFIRMATION_PHRASE)
    return { ok: false, because: `Type ${CONFIRMATION_PHRASE} exactly to confirm.` };
  if (!authenticatedAt || now - authenticatedAt > RECENT_AUTH_SECONDS)
    return { ok: false,
      because: "Sign in again before deleting your data. This is deliberate: it "
        + "means somebody using your open laptop cannot do this." };
  return { ok: true };
}
