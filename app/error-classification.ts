/* D645 · Shared by the server that decides whether to email and the owner page
   that groups what it shows, so the two can never disagree about what counts as
   the seller's own problem. Deliberately free of any server import - the admin
   page is a client component, and pulling error-log.ts in dragged
   `cloudflare:workers` into the browser bundle. */
const SELLER_FIXABLE=[
  /shipping_profile_id/i,
  /Choose an Etsy shipping profile/i,
  /shipping profile/i,
  /required listing field/i,
  /different shop/i,
  /taxonomy/i,
  /personalization/i,
  /title|tag|description/i,
  /has no listings yet/i,
  /batch could not be opened/i,
];

export function isSellerFixable(message:string){
  return SELLER_FIXABLE.some((pattern)=>pattern.test(String(message||"")));
}
