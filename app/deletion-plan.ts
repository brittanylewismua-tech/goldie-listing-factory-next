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
  { table: "shop_map_listing_sales", disposition: "delete",
    sql: `DELETE FROM shop_map_listing_sales WHERE user_id = ?`,
    say: "Your per-listing sales history inside Goldie." },
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
      + "Goldie can no longer read or publish to your shop." },
  { table: "printify_connections", disposition: "retire",
    sql: `UPDATE printify_connections SET encrypted_token = '' WHERE user_id = ?`,
    say: "Your Printify connection is switched off and its key destroyed." },
  { table: "member_entitlements", disposition: "retire",
    sql: `UPDATE member_entitlements SET state = 'none', plan = NULL WHERE user_id = ?`,
    say: "Your access to Goldie's features ends." },
];

/** Not touched, and why — shown to the member rather than left to be noticed. */
export const KEPT = [
  { what: "Listings, reviews and movement Goldie observed on public Etsy shops",
    why: "This is public marketplace evidence that other members' watches rely "
      + "on. It was never about you and it does not identify you." },
  { what: "The record that your connection existed",
    why: "Its keys are destroyed, so it cannot act. The row is what shows "
      + "nothing was published after you left." },
  { what: "Anonymous design-construction patterns",
    why: "They describe how designs are built, carry no wording or subject "
      + "matter, and are not linked to you." },
];

export const CONFIRMATION_PHRASE = "DELETE MY GOLDIE DATA";

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
