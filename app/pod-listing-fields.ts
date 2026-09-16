/**
 * THE THREE LISTING FIELDS EVERY PRINT-ON-DEMAND LISTING MUST CARRY.
 *
 * These are fields on the listing itself, not taxonomy property values, and
 * for a print-on-demand shop only one set of answers is truthful: the item is
 * made by a production partner, made to order, and is a finished product
 * rather than a craft supply.
 *
 * WHY THIS FILE EXISTS. The delivery path already forced these three values
 * and repaired any draft that disagreed (`service.ts` rewrites the snapshot
 * and attaches the production partner). The Listing Factory dry run carried
 * its own second copy of the same idea and answered `who_made: "i_did"` —
 * the claim that Brittany made the shirt herself. Nothing caught it because
 * the two payload builders never had to agree with each other.
 *
 * `i_did` on a print-on-demand listing is not a cosmetic difference. It is
 * the misrepresentation Etsy suspends shops for, and it is the answer that
 * makes a production partner impossible to attach.
 *
 * One exported constant, asserted by test against the delivery path, so a
 * second copy cannot drift again.
 */
export const POD_LISTING_FIELDS = {
  who_made: "someone_else",
  when_made: "made_to_order",
  is_supply: false,
} as const;

/** Which taxonomy property names are listing fields rather than property values. */
export const LISTING_FIELD_FOR_PROPERTY: Record<string, keyof typeof POD_LISTING_FIELDS> = {
  "Who made it": "who_made",
  "What is it": "is_supply",
  "When was it made": "when_made",
};
