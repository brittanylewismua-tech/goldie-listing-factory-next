/**
 * A MARKER THAT CANNOT BE MISTAKEN FOR ANYTHING OF THE MEMBER'S.
 *
 * The temporary validation product needs an identity that no template and no
 * customer product can collide with. A title is not enough: "INTERNAL TEST"
 * is something a seller could plausibly type, and a product id read off a
 * mockup URL is worse — that is the source of the near-miss where the batch
 * thumbnail's id turned out to be a real customer product linked to a live
 * Etsy listing.
 *
 * So the marker is an arbitrary token, and it is the only thing removal and
 * reconciliation match on.
 */
/*
  NO HYPHEN, NO UNDERSCORE, ON PURPOSE.

  When a title is not supplied explicitly the creation path derives one from
  the design's file name with `.replace(/[_-]+/g, " ")`. A marker containing a
  hyphen therefore arrives at Printify as "[gv 9f3a1c]" — silently different
  from the token the cleanup route matches on, which would leave a product
  that nothing could identify or remove.
*/
export const INTERNAL_VALIDATION_MARKER = "[gv9f3a1c]";

export const internalValidationTitle = () =>
  `INTERNAL TEST - DO NOT ORDER ${INTERNAL_VALIDATION_MARKER}`;

/** Only a product carrying the marker may be removed by the validation route. */
export const isInternalValidationProduct = (title: string) =>
  String(title ?? "").includes(INTERNAL_VALIDATION_MARKER);
