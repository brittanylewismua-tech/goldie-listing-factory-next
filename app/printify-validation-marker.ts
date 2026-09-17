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
export const INTERNAL_VALIDATION_MARKER = "[gv-9f3a1c]";

export const internalValidationTitle = () =>
  `INTERNAL TEST - DO NOT ORDER ${INTERNAL_VALIDATION_MARKER}`;

/** Only a product carrying the marker may be removed by the validation route. */
export const isInternalValidationProduct = (title: string) =>
  String(title ?? "").includes(INTERNAL_VALIDATION_MARKER);
