/*
  WHEN THE ETSY DETAILS PANEL HAS TO BE OPEN.

  Two obvious cases — no category, or a required property still blank — and a
  third that was missed and mattered most.

  A blueprint this product cannot map (`/api/listing-intelligence` calls
  `reviewFallback`) comes back with `confidence: "review"`, a GUESSED category
  from the product's name — "Handmade Items" when nothing else matches — and
  NO properties at all. So the category is non-empty, nothing is required and
  unset, and this returned false: the panel stayed collapsed and the member
  never saw it. A guess nobody looked at, on the one product type the factory
  admits it does not understand, heading for a real Etsy listing.

  `confidence` was computed on the server for exactly this and read nowhere.
*/
export function shouldOpenEtsyDetails(details:{
  category?:string;
  confidence?:"high"|"review";
  properties?:Array<{required:boolean;value:string}>;
}):boolean {
  if (details.confidence === "review") return true;
  return !details.category?.trim()
    || Boolean(details.properties?.some(property=>property.required&&!property.value.trim()));
}

/** Whether this listing's category and attributes are a guess to be checked. */
export const needsCategoryReview = (details:{confidence?:"high"|"review"}) =>
  details.confidence === "review";
