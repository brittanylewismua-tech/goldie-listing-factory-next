/* D857 · Which saved products belong to the Etsy shop the seller is in.
   Kept out of the route so it can be tested without a Worker. */

export type Proof = { printify_shop_id: number; etsy_shop_id: number };
export type Reach = "here" | "away" | "unproven";

/* A Printify store publishes to exactly one Etsy shop.

   D835 read shop_pairing_proofs three ways - here, away, unproven - and offered
   the unproven ones, on the reasoning that hiding a product on no evidence
   costs a seller work she can do. That is right only while nothing is known.

   Measured live on her account: active shop shesawolfclothing, Gildan Tee
   proven under She's A Wolf Clothing, and four GODISAGIRLAPPAREL products
   sitting in the same grid marked unproven. Nothing was unproven about them.
   One store was already known to be the one that pairs with the active shop,
   which makes every other store known not to be - and three of those four had
   already answered 409 when she tried.

   So: one proof for the active shop settles it. Before that, every store is
   still a candidate. */
export function reachResolver(activeEtsyShopId: number, proofs: Proof[]) {
  const here = new Set<number>(), away = new Set<number>();
  for (const proof of proofs) {
    if (activeEtsyShopId && proof.etsy_shop_id === activeEtsyShopId) here.add(proof.printify_shop_id);
    else away.add(proof.printify_shop_id);
  }
  const settled = here.size > 0;
  return (printifyShopId: number): Reach =>
    !printifyShopId || here.has(printifyShopId) ? "here"
      : away.has(printifyShopId) || settled ? "away"
      : "unproven";
}
