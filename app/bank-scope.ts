/* D860 · What the bank offers while one Etsy shop is active.
 *
 * This kept being fixed one surface at a time. D835 scoped the product grid and
 * left the bundles selectable; D836 disabled the bundles and left them on
 * display; D857 corrected which products count as away; D859 took the blocked
 * bundles out of the grid - and the bundle CREATOR still mapped the full recipe
 * list, so all five products came back as checkboxes and could be built into
 * another cross-shop bundle, and "Save 2 products first" counted products the
 * seller could not see.
 *
 * One answer, computed once, used by every surface. A product from a store that
 * does not publish to the active Etsy shop is not shown, not offered, and not
 * counted - anywhere.
 */

export type Scoped = { id: string; reach?: "here" | "away" | "unproven"; printifyShopTitle?: string };
export type ScopedBundle = { id: string; recipeIds: string[] };

export function scopeBank<R extends Scoped, B extends ScopedBundle>(recipes: R[], bundles: B[]) {
  const reachable = recipes.filter(recipe => recipe.reach !== "away");
  const elsewhere = recipes.filter(recipe => recipe.reach === "away");
  const elsewhereStores = [...new Set(elsewhere.map(recipe => recipe.printifyShopTitle || "another store"))];

  /* A bundle is only as reachable as its least reachable member: one product
     from another store and the whole bundle ends in the same 409, one step
     later. */
  const blockedMembers = (bundle: B) =>
    bundle.recipeIds
      .map(id => recipes.find(recipe => recipe.id === id))
      .filter((recipe): recipe is R => Boolean(recipe) && recipe!.reach === "away");

  const usableBundles = bundles.filter(bundle => blockedMembers(bundle).length === 0);
  const bundlesElsewhere = bundles.filter(bundle => blockedMembers(bundle).length > 0);

  /* Hidden work is still accounted for. Hiding it without saying how much there
     is or where it went is how a seller concludes Goldie lost it. */
  const hiddenCount = elsewhere.length + bundlesElsewhere.length;
  const hiddenStores = [...new Set([
    ...elsewhereStores,
    ...bundlesElsewhere.flatMap(bundle => blockedMembers(bundle).map(recipe => recipe.printifyShopTitle || "another store")),
  ])];

  return { reachable, elsewhere, elsewhereStores, usableBundles, bundlesElsewhere, hiddenCount, hiddenStores, blockedMembers };
}
