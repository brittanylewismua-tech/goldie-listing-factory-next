/**
 * ONE SWITCH, CLOSED BY DEFAULT.
 *
 * A real member was charged $14.99 for the Starter plan before Goldie was
 * meant to be on sale. Both the checkout route and the signup page read this,
 * so there is a single answer to "is Goldie on sale" rather than two that can
 * drift apart.
 *
 * CLOSED UNLESS EXPLICITLY OPENED. A missing, empty, or misspelled variable
 * leaves it shut. Only the exact string "open" opens it, so "true", "1" and a
 * typo all fail safe.
 */
export function checkoutOpen(): boolean {
  const raw = (globalThis as { CHECKOUT_OPEN?: string }).CHECKOUT_OPEN
    ?? (typeof process !== "undefined" ? process.env?.CHECKOUT_OPEN : undefined);
  return String(raw ?? "").trim().toLowerCase() === "open";
}

export const CLOSED_HEADLINE = "Not open yet";
export const CLOSED_BODY =
  "The Listing Factory is still in private testing. There's nothing to buy "
  + "right now, and no plans or prices are available yet.";
