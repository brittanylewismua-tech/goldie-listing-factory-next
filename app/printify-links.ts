/**
 * OPENING A DRAFT IN THE RIGHT PRINTIFY STORE.
 *
 * Measured against the live Printify app:
 *
 *   /app/store/{shopId}/orders    switches the selected store  ✓
 *   /app/store/{shopId}/products  bounces to the dashboard     ✗
 *   /app/editor/{productId}       carries no store at all
 *
 * The editor link resolves against whichever store the session has selected,
 * which is why a member with more than one store opens a perfectly good draft
 * and gets "this listing isn't available in the selected store".
 *
 * There is no one-URL answer: Printify has no store-scoped editor route. But
 * the switch URL is reliable, so opening the switch first and the editor
 * second lands on the right product in the right store.
 *
 * If the second step never runs - a slow load, a blocked script, a
 * middle-click that only follows the href - the member is still left in the
 * correct store, which is the failure they were hitting anyway. The fallback
 * is the fix working partially, never the old broken behaviour.
 */
export const PRINTIFY_APP = "https://printify.com/app";

export const storeSwitchUrl = (shopId: number) =>
  `${PRINTIFY_APP}/store/${shopId}/orders`;

export const editorUrl = (productId: string) =>
  `${PRINTIFY_APP}/editor/${productId}`;

export const productsUrl = () => `${PRINTIFY_APP}/store/products`;

/** Milliseconds to let the store switch land before the second navigation. */
export const SWITCH_SETTLE_MS = 2_500;

export type OpenTarget =
  | { kind: "editor"; shopId: number; productId: string }
  | { kind: "products"; shopId: number };

/**
 * The two navigations, in order.
 *
 * Returned as data rather than performed here so this stays testable and the
 * caller owns the window.
 */
export function openPlan(target: OpenTarget): { first: string; second: string | null } {
  /* With no shop id there is nothing to switch to, so go straight there and
     accept the old behaviour rather than bounce through a wrong store. */
  if (!target.shopId)
    return {
      first: target.kind === "editor" ? editorUrl(target.productId) : productsUrl(),
      second: null,
    };
  return {
    first: storeSwitchUrl(target.shopId),
    second: target.kind === "editor" ? editorUrl(target.productId) : productsUrl(),
  };
}
