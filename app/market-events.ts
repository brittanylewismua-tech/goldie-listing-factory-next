/**
 * WHAT CHANGED BETWEEN TWO LOOKS AT A LISTING.
 *
 * The old board kept only the latest reading and a nightly total, which meant
 * that when a number looked wrong there was nothing to go back to. This is the
 * replacement: every difference between two observations becomes a row, and
 * every claim the product makes later has to be re-derivable from those rows.
 *
 * PURE ON PURPOSE. No database, no Cloudflare, no clock of its own. It takes
 * two snapshots and gives back events, so the rules that decide whether a
 * seller is told something can be tested without a network.
 */

export type Snapshot = {
  listingId: number;
  shopId: number;
  /** When Goldie looked, not when Etsy changed anything. */
  observedAt: string;
  quantity: number | null;
  state: string;
  priceCents: number | null;
  favorites: number | null;
  views: number | null;
  /** Etsy's own timestamps, kept apart from ours. */
  lastModified: number | null;
  originalCreated: number | null;
  taxonomyId: number | null;
  /** Cheap fingerprints, so a change is detectable without storing the text. */
  titleHash: string;
  tagsHash: string;
  imageHash: string;
};

export type EventType =
  | "listing_became_active"
  | "listing_became_inactive"
  | "listing_sold_out"
  | "listing_reactivated"
  | "listing_renewed"
  | "aggregate_quantity_decreased"
  | "aggregate_quantity_increased"
  | "favorites_increased"
  | "views_increased"
  | "price_changed"
  | "title_changed"
  | "tags_changed"
  | "image_changed"
  | "taxonomy_changed";

export type ListingEvent = {
  listingId: number;
  shopId: number;
  type: EventType;
  previous: number | string | null;
  current: number | string | null;
  delta: number | null;
  observedAt: string;
  previousObservedAt: string;
  /** Set later, by the code that knows what else moved in the same shop. */
  conflicted?: boolean;
};

const SOLD_OUT_STATES = new Set(["sold_out"]);
const INACTIVE_STATES = new Set(["inactive", "expired", "removed", "unavailable", "edit"]);

/**
 * A quantity that changes by more than this between two looks is not a queue
 * of buyers, it is somebody editing stock. The number is deliberately small:
 * a print-on-demand listing that genuinely sells twenty units in one interval
 * is rare enough that missing it costs less than inventing it.
 */
export const IMPLAUSIBLE_DROP = 20;

const changed = (before: number | null, now: number | null) =>
  before !== null && now !== null && before !== now;

export function diffSnapshots(before: Snapshot, after: Snapshot): ListingEvent[] {
  const events: ListingEvent[] = [];
  const base = {
    listingId: after.listingId,
    shopId: after.shopId,
    observedAt: after.observedAt,
    previousObservedAt: before.observedAt,
  };
  const push = (
    type: EventType,
    previous: number | string | null,
    current: number | string | null,
    delta: number | null = null,
  ) => events.push({ ...base, type, previous, current, delta });

  /* State first: selling out is the single clearest thing a listing can do. */
  if (before.state !== after.state) {
    if (SOLD_OUT_STATES.has(after.state)) push("listing_sold_out", before.state, after.state);
    else if (INACTIVE_STATES.has(after.state)) push("listing_became_inactive", before.state, after.state);
    else if (after.state === "active" && SOLD_OUT_STATES.has(before.state))
      push("listing_reactivated", before.state, after.state);
    else if (after.state === "active") push("listing_became_active", before.state, after.state);
  }

  /*
    RENEWAL IS NOT BIRTH.

    Etsy resets creation_timestamp when a listing renews, which is why age has
    to come from original_creation_timestamp. A renewal is worth recording — a
    seller renewing a listing early often means it sold out — but it must never
    be read as a new listing.
  */
  if (
    before.lastModified !== null && after.lastModified !== null &&
    after.lastModified > before.lastModified &&
    before.quantity !== null && after.quantity !== null && after.quantity > before.quantity &&
    SOLD_OUT_STATES.has(before.state)
  )
    push("listing_renewed", before.lastModified, after.lastModified);

  if (changed(before.quantity, after.quantity)) {
    const delta = (after.quantity as number) - (before.quantity as number);
    if (delta < 0)
      push("aggregate_quantity_decreased", before.quantity, after.quantity, delta);
    else push("aggregate_quantity_increased", before.quantity, after.quantity, delta);
  }

  /* Counters only ever go up in a way worth recording; a fall is Etsy
     recalculating, not a buyer un-favouriting in a way we can use. */
  if (before.favorites !== null && after.favorites !== null && after.favorites > before.favorites)
    push("favorites_increased", before.favorites, after.favorites, after.favorites - before.favorites);
  if (before.views !== null && after.views !== null && after.views > before.views)
    push("views_increased", before.views, after.views, after.views - before.views);

  if (changed(before.priceCents, after.priceCents))
    push("price_changed", before.priceCents, after.priceCents,
      (after.priceCents as number) - (before.priceCents as number));

  if (before.titleHash !== after.titleHash) push("title_changed", before.titleHash, after.titleHash);
  if (before.tagsHash !== after.tagsHash) push("tags_changed", before.tagsHash, after.tagsHash);
  if (before.imageHash !== after.imageHash) push("image_changed", before.imageHash, after.imageHash);
  if (changed(before.taxonomyId, after.taxonomyId))
    push("taxonomy_changed", before.taxonomyId, after.taxonomyId);

  return events;
}

/** The marks of somebody editing their shop rather than somebody buying. */
export const EDIT_EVENTS = new Set<EventType>([
  "title_changed", "tags_changed", "image_changed", "price_changed", "taxonomy_changed",
]);

/**
 * IS THIS A SHOP UPDATE RATHER THAN A DAY'S TRADING?
 *
 * A seller running a bulk edit moves quantities all over the shop at once, and
 * every one of those drops would otherwise look like a sale. Two shapes give
 * it away: a listing whose text, images and price all moved in the same
 * interval as its stock, and a shop where a large share of listings moved
 * stock at once.
 */
export function bulkEditSuspected(
  events: ListingEvent[],
  listingsObserved: number,
  { share = 0.4, minimum = 4 }: { share?: number; minimum?: number } = {},
): boolean {
  const movedStock = new Set(
    events.filter(event => event.type === "aggregate_quantity_decreased").map(event => event.listingId),
  );
  if (movedStock.size >= minimum && listingsObserved > 0 && movedStock.size / listingsObserved >= share)
    return true;
  return false;
}

/** The same question for one listing: did its stock move inside an edit? */
export function editedInSameInterval(events: ListingEvent[], listingId: number): boolean {
  const mine = events.filter(event => event.listingId === listingId);
  const edits = mine.filter(event => EDIT_EVENTS.has(event.type));
  return edits.length >= 2;
}

/**
 * Sales-linked activity: the only events allowed to be described to a seller
 * as selling. Everything the handoff requires is enforced here rather than
 * trusted to the caller.
 */
export type SalesLinked = {
  listingId: number;
  shopId: number;
  units: number;
  observedAt: string;
  previousObservedAt: string;
  reason: "quantity_fell" | "sold_out" | "renewed_after_sold_out";
};

export function salesLinked(
  events: ListingEvent[],
  shopSoldDelta: number,
  listingsObserved: number,
): { linked: SalesLinked[]; unresolved: number; conflicted: boolean } {
  /* THE GATE. No increase in the shop's own sold count, no sale — a quantity
     drop on its own is a restock, an edit, or a print provider resetting
     stock. */
  if (shopSoldDelta <= 0) return { linked: [], unresolved: 0, conflicted: false };

  const conflicted = bulkEditSuspected(events, listingsObserved);
  if (conflicted) return { linked: [], unresolved: shopSoldDelta, conflicted: true };

  const candidates: SalesLinked[] = [];
  for (const event of events) {
    if (editedInSameInterval(events, event.listingId)) continue;
    if (event.type === "aggregate_quantity_decreased" && event.delta !== null) {
      const units = Math.abs(event.delta);
      /* A drop too large to be a queue of buyers is inventory management. */
      if (units > IMPLAUSIBLE_DROP) continue;
      candidates.push({
        listingId: event.listingId, shopId: event.shopId, units,
        observedAt: event.observedAt, previousObservedAt: event.previousObservedAt,
        reason: "quantity_fell",
      });
    } else if (event.type === "listing_sold_out") {
      candidates.push({
        listingId: event.listingId, shopId: event.shopId, units: 1,
        observedAt: event.observedAt, previousObservedAt: event.previousObservedAt,
        reason: "sold_out",
      });
    } else if (event.type === "listing_renewed") {
      candidates.push({
        listingId: event.listingId, shopId: event.shopId, units: 1,
        observedAt: event.observedAt, previousObservedAt: event.previousObservedAt,
        reason: "renewed_after_sold_out",
      });
    }
  }

  /*
    THE CAP, AND HOW IT IS FILLED.

    Assigned units can never exceed what the shop's own counter says it sold.
    When candidates add up to more than that, the largest movement is taken
    first and ties break on the lower listing id, so the same inputs always
    give the same answer and nothing is ever apportioned by popularity,
    views, age or judgement.
  */
  /*
    ONE LISTING, ONE CLAIM PER INTERVAL.

    Selling out shows up twice — the stock fell, and the state changed — and
    crediting both would let a single sale consume two units of the shop's
    increase, pushing a real sale somewhere else into "unresolved". The
    quantity evidence wins because it carries the count.
  */
  const PRECEDENCE: Record<SalesLinked["reason"], number> = {
    quantity_fell: 0, sold_out: 1, renewed_after_sold_out: 2,
  };
  const best = new Map<number, SalesLinked>();
  for (const candidate of candidates) {
    const held = best.get(candidate.listingId);
    if (!held || PRECEDENCE[candidate.reason] < PRECEDENCE[held.reason])
      best.set(candidate.listingId, candidate);
  }
  const deduped = [...best.values()];
  deduped.sort((a, b) => b.units - a.units || a.listingId - b.listingId);
  const linked: SalesLinked[] = [];
  let room = shopSoldDelta;
  for (const candidate of deduped) {
    if (room <= 0) break;
    const units = Math.min(candidate.units, room);
    linked.push({ ...candidate, units });
    room -= units;
  }
  return { linked, unresolved: room, conflicted: false };
}
