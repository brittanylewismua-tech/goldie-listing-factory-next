/**
 * THE TWO PRODUCTS GOLDIE SELLS, IN ONE PLACE.
 *
 * Names, prices and what each plan unlocks live here and nowhere else. The
 * previous three-tier arrangement (Starter / Pro / Scale) sold allowances of a
 * feature that no longer exists in the interface, and its prices were spread
 * across billing code, the pricing page and the usage screen. When they
 * disagreed, the member believed whichever one they happened to be reading.
 *
 * NOTHING HERE CHARGES ANYBODY. These are definitions. Checkout, Stripe price
 * ids and live subscription changes are deliberately not wired to them during
 * private beta; `LIVE_CHECKOUT_ENABLED` is the single switch and it is off.
 */
export const LIVE_CHECKOUT_ENABLED = false;

export type SuitePlanKey = "listing_factory" | "full_suite";

export type Feature =
  | "listingFactory" | "designScanner" | "marketWatch" | "shopMap"
  | "trademarkStandalone" | "trademarkAtPublish";

export const SUITE_PLANS = {
  listing_factory: {
    key: "listing_factory",
    name: "Listing Factory",
    monthly: 19,
    /* Yearly is a configurable product, not a decided price. Null means "not
       decided", which is different from zero and must never render as free. */
    yearly: null as number | null,
    features: ["listingFactory", "trademarkAtPublish"] as Feature[],
    blurb: "Bulk Printify-to-Etsy listing creation, with a trademark check before you publish.",
  },
  full_suite: {
    key: "full_suite",
    name: "Full Suite",
    monthly: 47,
    yearly: null as number | null,
    features: ["listingFactory", "trademarkAtPublish", "designScanner",
      "marketWatch", "shopMap", "trademarkStandalone"] as Feature[],
    blurb: "Everything: the factory, Design Scanner, Market Watch, Shop Map and the Trademark Checker.",
  },
} as const;

/**
 * Entitlement states a member can be in.
 *
 * `beta` is the one that matters today: complimentary full access, granted by
 * hand, with no payment attached. `grandfathered` covers the founding
 * customers, whose access is configured rather than inferred from a price.
 */
export type EntitlementState =
  | "beta"           /* private-beta complimentary */
  | "grandfathered"  /* founding customer, configured allowance */
  | "active"         /* paying, current */
  | "canceled"       /* canceled, still inside the paid period */
  | "past_due"       /* payment failed, inside the grace window */
  | "none";          /* no entitlement */

export type Entitlement = {
  state: EntitlementState;
  plan: SuitePlanKey | null;
  /* When access ends. Null means open-ended (beta, grandfathered). */
  until: number | null;
  /* Set only by an admin override, and always with a reason. */
  overrideBy?: string;
  overrideReason?: string;
};

export const GRACE_DAYS = 7;

/**
 * Does this entitlement reach this feature, right now?
 *
 * Deliberately one function. Every gate in the product calls it, so there is
 * one answer to "can they" rather than one per screen.
 */
export function allows(
  entitlement: Entitlement, feature: Feature, now: number,
): { ok: true } | { ok: false; because: string; upgrade: SuitePlanKey | null } {
  const inPlan = (plan: SuitePlanKey | null) =>
    Boolean(plan && (SUITE_PLANS[plan].features as readonly Feature[]).includes(feature));

  /* Complimentary access reaches everything, and is what private beta runs on. */
  if (entitlement.state === "beta") return { ok: true };

  if (entitlement.state === "grandfathered")
    return inPlan(entitlement.plan ?? "full_suite")
      ? { ok: true }
      : { ok: false, because: "That is not part of your plan.", upgrade: "full_suite" };

  if (entitlement.state === "none")
    return { ok: false, because: "Your Goldie access is not active.", upgrade: "full_suite" };

  /* Canceled keeps working to the end of the period that was paid for.
     Cutting access at the cancel click bills for time nobody gets. */
  if (entitlement.state === "canceled") {
    if (entitlement.until !== null && now > entitlement.until)
      return { ok: false, because: "Your Goldie access ended.", upgrade: entitlement.plan };
    return inPlan(entitlement.plan)
      ? { ok: true }
      : { ok: false, because: "That is not part of your plan.", upgrade: "full_suite" };
  }

  /* Past due keeps working through a short grace window, because a card that
     expired is not a member who left. */
  if (entitlement.state === "past_due") {
    const graceEnds = (entitlement.until ?? now) + GRACE_DAYS * 86_400;
    if (now > graceEnds)
      return { ok: false, because: "There is a problem with your payment method.",
        upgrade: entitlement.plan };
    return inPlan(entitlement.plan)
      ? { ok: true }
      : { ok: false, because: "That is not part of your plan.", upgrade: "full_suite" };
  }

  /* Active. */
  if (entitlement.until !== null && now > entitlement.until)
    return { ok: false, because: "Your Goldie access ended.", upgrade: entitlement.plan };
  return inPlan(entitlement.plan)
    ? { ok: true }
    : { ok: false,
        because: `${feature === "listingFactory" ? "Listing Factory" : "That"} is part of the Full Suite.`,
        upgrade: "full_suite" };
}

/** Upgrade takes effect now; downgrade waits for the period the member paid for. */
export function planChange(
  from: SuitePlanKey, to: SuitePlanKey, periodEnd: number,
): { effective: "immediate" | "period-end"; at: number | null } {
  const rank = { listing_factory: 0, full_suite: 1 } as const;
  return rank[to] > rank[from]
    ? { effective: "immediate", at: null }
    : { effective: "period-end", at: periodEnd };
}
