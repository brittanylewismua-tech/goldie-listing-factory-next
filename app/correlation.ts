/**
 * ATTRIBUTION WITHOUT ASKING ETSY ANYTHING.
 *
 * WHAT THIS REPLACES, AND WHY IT HAD TO BE REPLACED.
 *
 * The old design opened one Etsy inspection per shop interval: the sensor saw
 * a shop's counter move, and a job went off to re-read every listing in that
 * shop to find out which one. Measured in production, that produced roughly
 * 130 intervals every 100 seconds against about 2 completed inspections — a
 * queue of 31,694, a p95 delay of 37 hours, and inspections that finally ran
 * 43 hours late and attributed nothing at all, because Etsy shows current
 * stock rather than history and the shops had long since restocked.
 *
 * No amount of extra batches fixes a consumer that is sixty times slower than
 * its producer. The work had to stop being an API call.
 *
 * WHAT REPLACES IT. The listing poller ALREADY reads every monitored listing
 * on a ten-minute sweep and writes append-only `listing_events` — quantity
 * drops, sell-outs, reactivations. The sensor ALREADY records shop-level
 * intervals. Both halves of the evidence are in the database before anything
 * is correlated. So correlation is a join, it costs zero Etsy calls, and it
 * can run as fast as D1 will answer.
 *
 * WHAT IS NOT NEGOTIABLE. Every rule the inspector enforced survives, because
 * they are what make the number honest rather than impressive:
 *
 *   - the shop's own observed increase is a HARD CAP on attributed units
 *   - unmatched shop sales are never spread across listings
 *   - an ambiguous candidate is never chosen between
 *   - unresolved units stay unresolved, permanently, in a column that says so
 *   - every attribution records the exact listing event ids behind it
 *
 * RECOMPUTABLE. Because the inputs are append-only and the rule version is
 * stored, changing a rule means recomputing, not losing history.
 */
export const CORRELATION_RULE_VERSION = 1;

/**
 * TIMING.
 *
 * A shop interval cannot be correlated the instant it closes: the poller may
 * not have visited that shop's listings yet, and correlating early would
 * conclude "nothing moved" from evidence that had not been collected. So an
 * interval waits until a full sweep has had a fair chance to observe it.
 *
 * And it cannot wait forever: past the useful window the listing data is too
 * old to mean anything, and the interval is expired rather than guessed at.
 */
export const SWEEP_MINUTES = 10;
/* One full sweep plus a margin: the poller is bounded per firing, so a listing
   may be read on the sweep after the one during which the sale happened. */
export const EARLIEST_CORRELATION_SECONDS = 2 * SWEEP_MINUTES * 60;
/* Beyond this the shop has probably restocked and the evidence is gone. The
   old architecture's median delay was already past this. */
export const MAX_EVIDENCE_AGE_SECONDS = 6 * 3_600;

export type ShopInterval = {
  id: number;
  shopId: number;
  soldDelta: number;
  fromObserved: number;
  toObserved: number;
};

export type ListingEvent = {
  id: number;
  listingId: number;
  shopId: number;
  type: string;
  delta: number | null;
  observedAt: number;
  previousObservedAt: number;
};

export type Attribution = {
  listingId: number;
  units: number;
  reason: "quantity_fell" | "sold_out" | "renewed_after_sold_out";
  eventIds: number[];
};

export type Correlated = {
  intervalId: number;
  shopId: number;
  attributions: Attribution[];
  attributedUnits: number;
  unresolvedUnits: number;
  conflicted: boolean;
  because: string;
};

export type Timing =
  | { state: "too-early"; readyAt: number }
  | { state: "ready" }
  | { state: "expired"; ageSeconds: number };

/** Is this interval correlatable yet, still, or never? */
export function timingFor(
  interval: ShopInterval, now: number,
  { earliest = EARLIEST_CORRELATION_SECONDS, maxAge = MAX_EVIDENCE_AGE_SECONDS } = {},
): Timing {
  const age = now - interval.toObserved;
  if (age > maxAge) return { state: "expired", ageSeconds: age };
  if (age < earliest) return { state: "too-early", readyAt: interval.toObserved + earliest };
  return { state: "ready" };
}

/*
  A listing event belongs to an interval when the change was observed inside
  the interval, with a margin on each side: the poller and the sensor are two
  clocks, and a sale seen by one at 12:00:59 can be seen by the other at
  12:01:03. The margin is deliberately smaller than a sweep so it cannot pull
  in a change from a neighbouring interval.
*/
export const WINDOW_MARGIN_SECONDS = 90;

export function eventsInWindow(
  interval: ShopInterval, events: ListingEvent[],
  { margin = WINDOW_MARGIN_SECONDS } = {},
): ListingEvent[] {
  const from = interval.fromObserved - margin;
  const to = interval.toObserved + margin;
  return events.filter(event =>
    event.shopId === interval.shopId
    /* The change happened between two readings; it counts when that PAIR of
       readings overlaps the interval, not merely when the later one does. */
    && event.observedAt <= to && event.previousObservedAt >= from - margin);
}

/* Selling out shows up twice — the stock fell, and the state changed — and
   crediting both lets one sale consume two units of the shop's increase. */
const PRECEDENCE: Record<Attribution["reason"], number> = {
  quantity_fell: 0, sold_out: 1, renewed_after_sold_out: 2,
};

/** A drop too large to be a queue of buyers is inventory management. */
export const IMPLAUSIBLE_DROP = 20;

/**
 * Correlate one interval.
 *
 * The shape of the decision is deliberately the same as the inspector's, so
 * the two can be compared on the same evidence during changeover.
 */
export function correlate(
  interval: ShopInterval, events: ListingEvent[], listingsObserved: number,
): Correlated {
  const empty = (because: string, conflicted = false): Correlated => ({
    intervalId: interval.id, shopId: interval.shopId, attributions: [],
    attributedUnits: 0, unresolvedUnits: Math.max(0, interval.soldDelta),
    conflicted, because,
  });

  /* THE GATE. No increase in the shop's own sold count, no sale. */
  if (interval.soldDelta <= 0) return { ...empty("the shop's counter did not move"),
    unresolvedUnits: 0 };

  const candidates: Attribution[] = [];
  const edited = new Set(events.filter(event => event.type === "listing_edited")
    .map(event => event.listingId));

  for (const event of events) {
    /* A listing edited in the same window cannot be read as a sale: an edit
       can move stock for reasons that have nothing to do with a buyer. */
    if (edited.has(event.listingId)) continue;
    if (event.type === "aggregate_quantity_decreased" && event.delta !== null) {
      const units = Math.abs(event.delta);
      if (units > IMPLAUSIBLE_DROP) continue;
      candidates.push({ listingId: event.listingId, units,
        reason: "quantity_fell", eventIds: [event.id] });
    } else if (event.type === "listing_sold_out") {
      candidates.push({ listingId: event.listingId, units: 1,
        reason: "sold_out", eventIds: [event.id] });
    } else if (event.type === "listing_renewed") {
      candidates.push({ listingId: event.listingId, units: 1,
        reason: "renewed_after_sold_out", eventIds: [event.id] });
    }
  }

  /*
    A BULK EDIT LOOKS EXACTLY LIKE A RUSH OF BUYERS.

    When a large share of the shop's listings moved at once, this is somebody
    editing their shop, and nothing is attributed.
  */
  const movers = new Set(candidates.map(row => row.listingId)).size;
  if (listingsObserved > 0 && movers > 5 && movers / listingsObserved > 0.5)
    return empty("too many listings moved at once to be buyers", true);

  if (!candidates.length) return empty("no listing change was observed in this window");

  /* One listing, one claim. Quantity evidence wins because it carries a count. */
  const best = new Map<number, Attribution>();
  for (const candidate of candidates) {
    const held = best.get(candidate.listingId);
    if (!held || PRECEDENCE[candidate.reason] < PRECEDENCE[held.reason])
      best.set(candidate.listingId, candidate);
    else if (held.reason === candidate.reason)
      /* Two events of the same kind for one listing inside one window are one
         claim with two pieces of evidence, not two sales. */
      held.eventIds = [...new Set([...held.eventIds, ...candidate.eventIds])];
  }

  const deduped = [...best.values()]
    .sort((a, b) => b.units - a.units || a.listingId - b.listingId);

  /*
    THE CAP, AND HOW IT IS FILLED.

    Never more than the shop said it sold. Largest movement first, ties broken
    on the lower listing id, so the same inputs always give the same answer and
    nothing is apportioned by popularity, views, age or judgement.
  */
  const attributions: Attribution[] = [];
  let room = interval.soldDelta;
  for (const candidate of deduped) {
    if (room <= 0) break;
    const units = Math.min(candidate.units, room);
    attributions.push({ ...candidate, units });
    room -= units;
  }

  const attributed = attributions.reduce((total, row) => total + row.units, 0);
  return {
    intervalId: interval.id, shopId: interval.shopId, attributions,
    attributedUnits: attributed,
    /* What the shop sold that no listing change explains. It stays unresolved
       rather than being spread across whatever happens to be nearby. */
    unresolvedUnits: Math.max(0, interval.soldDelta - attributed),
    conflicted: false,
    because: attributed ? "matched to observed listing changes"
      : "listing changes were observed but none could be credited",
  };
}
