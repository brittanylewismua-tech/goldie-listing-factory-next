"use client";
import { useEffect, useState } from "react";
import { monthName } from "@/app/shop-map-month";

type Niche = {
  worldId: string; label: string; listings: number; activeListings: number;
  period: string; orders: number; revenueMinor: number;
  lifetimeOrders: number; lifetimeRevenueMinor: number; evidence: string;
  productFamilies: Array<{ family: string; listings: number }>;
  reviews: { recent: number; lifetimeHeld: number };
};
type Focus = { nicheId: string; label: string; headline: string; advice: string; reason: string };
type ShopMap = {
  shop?: { shopName: string };
  month?: string;
  thisMonth?: { revenueMinor: number; etsyFeesMinor: number; productionCostMinor: number;
    headline: string; profitMinor: number | null; accuracy: string; orders: number;
    salesAsOf?: number; salesStale?: boolean; freshness?: string;
    /* What this month's figures may be called. An estimate must never be
       able to read as a verified figure, so the distinction is structural
       rather than a word inside `headline`. */
    label?: "verified" | "estimated" | "unavailable";
    coverage?: { verified: number; estimated: number; unavailable: number } };
  standout?: { hasStandout: boolean; headline: string; nextStep: string };
  whereToFocus?: Focus[];
  /*
    Plain sentences about how the niches were organised, written on the
    server. This page never sees the wording they were built from.
  */
  grouping?: {
    found?: number;
    shown?: number;
    notes?: Array<{ kind: "grouped" | "left-out"; sentence: string }>;
  };
  worlds?: Niche[];
  unclassifiedCard?: Niche;
  worldsPeriod?: string;
  directionBasis?: string;
  directionCaveat?: string;
  coverage?: { activeListings: number; recentRevenue: number; recentOrders: number };
  unclassifiedPerformance?: { listings: number; activeListings: number; orders: number;
    revenueMinor: number; reviews: number; ordersLast90: number; revenueLast90Minor: number };
  needsAttention?: { overbuiltWorlds: Array<{ label: string; reason: string }> };
  shopTotals?: { listings: number; orders: number };
  timezoneNeeded?: boolean;
  error?: string;
};

/*
  Whether this month's profit is an exact figure or an estimate. The label
  the server computes is authoritative; the cost coverage is the fallback for
  a response saved before the label was sent, so an older cached month still
  cannot present an estimate as verified.
*/
function monthBasis(month: { label?: string;
  coverage?: { estimated: number; unavailable: number } } | undefined) {
  if (!month) return "unknown";
  if (month.label === "estimated") return "estimated";
  if (month.label === "verified") return "verified";
  if (month.label === "unavailable") return "unavailable";
  if ((month.coverage?.unavailable ?? 0) > 0) return "unavailable";
  if ((month.coverage?.estimated ?? 0) > 0) return "estimated";
  return "verified";
}

const money = (minor: number | null | undefined) =>
  minor === null || minor === undefined ? "—"
    : `${minor < 0 ? "-" : ""}$${Math.abs(minor / 100).toLocaleString(undefined,
      { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ShopMapClient({ signedInEmail }: { signedInEmail?: string }) {
  const [map, setMap] = useState<ShopMap | null>(null);
  const [open, setOpen] = useState("");
  const [busy, setBusy] = useState("");
  /* The last map that loaded. A failed refresh shows this rather than nothing. */
  const [lastGood, setLastGood] = useState<ShopMap | null>(null);
  const [failed, setFailed] = useState(false);

  const load = async () => {
    const next = await fetch("/api/shop-map/map")
      .then(response => response.json() as Promise<ShopMap>)
      .catch(() => null);
    if (!next || next.error) { setFailed(true); return; }
    setFailed(false);
    setMap(next);
    setLastGood(next);
  };
  useEffect(() => { void load(); }, []);

  /*
    The browser knows where the member is; Shop Map asks rather than assumes.
    A timezone is stored for THIS member's THIS shop only, and only once they
    say yes - month boundaries move real money between months.
  */
  const detected = typeof Intl !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";

  const confirmTimezone = async () => {
    setBusy("timezone");
    await fetch(`/api/shop-map/financial/settings?timezone=${encodeURIComponent(detected)}`
      + `&detected=${encodeURIComponent(detected)}`).catch(() => undefined);
    await load();
    setBusy("");
  };

  /*
    A CORRECTION THAT FAILED MUST NOT LOOK LIKE ONE THAT WORKED.

    This swallowed every failure and reloaded the map, so a member who moved a
    listing into the wrong niche and was refused saw the listing sitting
    exactly where it had been, with no error — indistinguishable from a move
    that had been saved and then correctly shown. Correcting a classification
    is the one thing on this page a member does TO their data, so it is the
    one place silence is least affordable.
  */
  const [correctionFailed, setCorrectionFailed] = useState("");

  const moveListing = async (listingId: number, nicheId: string) => {
    setBusy(`move:${listingId}`);
    setCorrectionFailed("");
    try {
      const response = await fetch("/api/shop-map/correct", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "move-listing", listingId,
          worldIds: nicheId === "unclassified" ? [] : [nicheId] }) });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        setCorrectionFailed(body.error
          ?? "That change could not be saved. The listing is where it was.");
      }
    } catch {
      setCorrectionFailed("That change could not be saved. The listing is where it was.");
    }
    await load();
    setBusy("");
  };

  const clearCorrection = async (listingId: number) => {
    setBusy(`clear:${listingId}`);
    setCorrectionFailed("");
    try {
      const response = await fetch("/api/shop-map/correct", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear-correction", listingId }) });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        setCorrectionFailed(body.error
          ?? "That correction could not be cleared. It is still in place.");
      }
    } catch {
      setCorrectionFailed("That correction could not be cleared. It is still in place.");
    }
    await load();
    setBusy("");
  };

  const shown = map ?? lastGood;

  if (!shown && failed)
    return <main className="shop-map"><p className="shop-map-state">
      Shop Map could not load just now. Nothing has changed — try again in a moment.
    </p></main>;
  if (!shown)
    /*
      D1604 · A sentence on a white page was the whole loading state, and Shop
      Map takes a few seconds to read a shop. The shape of what is coming is
      drawn instead, so the wait has somewhere to land and the page does not
      jump when it arrives.
    */
    return <main className="shop-map p-grid">
      <div className="p-page">
        <div className="p-head">
          <p className="p-eyebrow">Shop Map</p>
          <div className="p-skeleton p-skeleton-line" style={{ width: "40%", height: 26 }} />
          <div className="p-skeleton p-skeleton-line" style={{ width: "62%" }} />
        </div>
        <p className="shop-map-state" role="status">Organizing your shop…</p>
        <div className="p-stack" aria-hidden="true">
          <div className="p-skeleton p-skeleton-card" />
          <div className="p-skeleton p-skeleton-card" />
          <div className="p-skeleton p-skeleton-card" />
        </div>
      </div>
    </main>;

  const month = shown.thisMonth;
  const niches = [...(shown.worlds ?? [])];
  if (shown.unclassifiedCard?.listings) niches.push(shown.unclassifiedCard);
  const recentTotal = niches.reduce((sum, niche) => sum + niche.revenueMinor, 0);
  const noSalesYet = (shown.shopTotals?.orders ?? 0) === 0;

  return (
    <main className="shop-map">
      <header className="shop-map-head">
        <h1>Shop Map</h1>
        <p>{monthName(shown.month)}</p>
      </header>

      {failed
        ? <p className="shop-map-stale">Showing your last map — the newest refresh didn’t finish.</p>
        : null}

      {/* 1 · This month. One dominant figure, never two. */}
      {shown.timezoneNeeded
        ? <section className="shop-map-card">
            <h2>This month</h2>
            <p className="shop-map-reason">
              Monthly figures need to know where your shop trades, because a month
              starts and ends at a different moment in each place.
            </p>
            {detected
              ? <button type="button" className="shop-map-confirm"
                  disabled={busy === "timezone"} onClick={() => void confirmTimezone()}>
                  {busy === "timezone" ? "Saving…" : `My shop runs on ${detected}`}
                </button>
              : null}
          </section>
        : <section className="shop-map-card shop-map-money">
            <h2>This month</h2>
            <p className="shop-map-headline-label">{month?.headline}</p>
            {/* The figure line is omitted entirely when there is no profit to
                show. It used to render a bare em dash under "Profit
                unavailable", which reads as a broken value rather than an
                absent one. */}
            {month?.profitMinor !== null && month?.profitMinor !== undefined && (
              <p className="shop-map-figure" data-basis={monthBasis(month)}>
                {money(month.profitMinor)}
                {/*
                  D1677 · ON THE FIGURE, NOT ONLY IN THE SENTENCE ABOVE IT.

                  An estimate was distinguishable only by the word
                  "Estimated" in the headline. A member reading the number
                  first — which is what a number that size invites — saw
                  nothing marking it as provisional. The mark sits on the
                  figure, and it is driven by the verdict's own label with
                  the cost coverage as a fallback, so it cannot be lost to a
                  copy change.
                */}
                {monthBasis(month) === "estimated" && (
                  <span className="shop-map-basis-chip">Estimate</span>
                )}
              </p>
            )}
            <p className="shop-map-accuracy">{month?.accuracy}</p>
            {/*
              D1684 · How current the figure is, beside the figure. The
              financial view already refused profit with staleness as its
              first reason while this card mentioned only production costs.
              The sentence is built on the server, so the page never handles
              a source name.
            */}
            {month?.freshness && (
              <p className="shop-map-freshness"
                data-stale={month.salesStale ? "yes" : "no"}>
                {month.freshness}
              </p>
            )}
            <dl className="shop-map-rows">
              <div><dt>Revenue</dt><dd>{money(month?.revenueMinor)}</dd></div>
              <div><dt>Etsy fees</dt><dd>{money(month?.etsyFeesMinor)}</dd></div>
              <div>
                <dt>Production</dt>
                {/*
                  A COST THAT IS UNKNOWN IS NOT ZERO.

                  This rendered "$0.00" directly beneath "Production costs
                  missing for 1 of 1 orders" — two lines of the same card
                  contradicting each other, and the zero is the one a member
                  would believe. It now says what is true.
                */}
                {/*
                  D1672 · AND NO MONTH AT ALL IS NOT ZERO EITHER.

                  The fix above caught the case where coverage says the cost
                  is unavailable. With no `thisMonth` in the payload — a shop
                  read before its first month closed — the fallback was a
                  literal 0, so Production read "$0.00" in a list where
                  Revenue and Etsy fees both read "—". The same wrong claim,
                  reached through the other door: money(undefined) already
                  renders the dash every other row uses.
                */}
                <dd>{month?.coverage?.unavailable
                  ? "Not available"
                  : money(month ? -month.productionCostMinor : undefined)}</dd>
              </div>
              <div><dt>Orders</dt><dd>{month?.orders ?? 0}</dd></div>
            </dl>
            {month?.coverage?.unavailable ? (
              /* Told there is a problem, and given the way to fix it. */
              <a className="shop-map-fix" href="/shop-map/costs">
                Add the missing production cost
              </a>
            ) : null}
          </section>}

      {/* 2 · One sentence, or the reason there isn't one. */}
      <section className="shop-map-card">
        <h2>Your shop is pointing here</h2>
        {noSalesYet
          ? <p className="shop-map-reason">No sales yet, so there is nothing to point at.</p>
          : shown.standout?.hasStandout
            ? <>
                <p className="shop-map-world-name">{shown.standout.headline}</p>
                <p className="shop-map-reason">{shown.standout.nextStep}</p>
              </>
            : <>
                <p className="shop-map-world-name">{shown.standout?.headline ?? "No clear direction yet."}</p>
                <p className="shop-map-reason">{shown.standout?.nextStep}</p>
              </>}
        {shown.directionBasis || shown.directionCaveat
          ? <p className="shop-map-caveat">
              {shown.directionBasis} {shown.directionCaveat}
            </p>
          : null}
      </section>

      {/*
        2b · WHERE TO FOCUS.

        Arrives on every response, was declared in this file's own type, and
        was rendered nowhere. The thin entries are grouped rather than given
        a card each: four identical cards saying nothing happened is how a
        real finding gets lost among them.
      */}
      {(shown.whereToFocus ?? []).length > 0 && (
        <section className="shop-map-card">
          <h2>Where to focus</h2>
          {(shown.whereToFocus ?? [])
            .filter(focus => !/needs more data/i.test(focus.headline))
            .map(focus => (
              <div className="shop-map-focus" key={focus.nicheId || focus.label}>
                <p className="shop-map-world-name">{focus.label} · {focus.headline}</p>
                <p className="shop-map-reason">{focus.reason}</p>
                {focus.advice ? <p className="shop-map-advice">{focus.advice}</p> : null}
              </div>
            ))}
          {(() => {
            const thin = (shown.whereToFocus ?? [])
              .filter(focus => /needs more data/i.test(focus.headline));
            if (!thin.length) return null;
            return (
              <p className="shop-map-reason shop-map-thin">
                Not enough recent orders to read a pattern in{" "}
                {thin.map(focus => focus.label).join(", ")}. They stay on the map
                with their lifetime figures.
              </p>
            );
          })()}
        </section>
      )}

      {/*
        2c · HOW THESE NICHES WERE ORGANIZED.

        Closed by default: it answers a question a member only sometimes has,
        and an open block of reasoning above their actual niches would bury
        them. Open, it is the difference between a grouping they can check
        and one they can only accept — and the control to disagree with it
        sits directly below.
      */}
      {(shown.grouping?.notes ?? []).length > 0 && (
        <section className="shop-map-card">
          <details className="shop-map-grouping">
            <summary>
              <span>How these niches were organized</span>
              <span className="shop-map-grouping-chevron" aria-hidden="true">⌄</span>
            </summary>
            <p className="shop-map-reason">
              Your listings suggested {shown.grouping?.found} groupings. Shop Map
              shows {shown.grouping?.shown}, because some of them describe the same
              thing.
            </p>
            <ul className="shop-map-grouping-notes">
              {(shown.grouping?.notes ?? []).map(note => (
                <li key={note.sentence} data-kind={note.kind}>{note.sentence}</li>
              ))}
            </ul>
            <p className="shop-map-reason">
              If any of this is wrong, move a listing below and its orders and
              revenue move with it.
            </p>
          </details>
        </section>
      )}

      {/* 3 · The niches. Recent first, lifetime as history. */}
      <section className="shop-map-card">
        <h2>Your niches</h2>
        <p className="shop-map-period">
          {shown.worldsPeriod}
          {shown.coverage
            ? ` · ${Math.round(shown.coverage.activeListings * 100)}% of active listings organized`
            : ""}
        </p>
        <ul className="shop-map-worlds">
          {niches.map(niche => {
            const share = recentTotal ? niche.revenueMinor / recentTotal : 0;
            /* Written out rather than built from a variable: a class the
               stylesheet defines should be findable by searching for it. */
            const strength = share >= 0.25 ? "shop-map-world-strong"
              : share >= 0.1 ? "shop-map-world-mid" : "shop-map-world-quiet";
            return (
              <li key={niche.worldId}>
                <button type="button"
                  className={`shop-map-world ${strength}`}
                  aria-expanded={open === niche.worldId}
                  onClick={() => setOpen(open === niche.worldId ? "" : niche.worldId)}>
                  <span className="shop-map-world-label">{niche.label}</span>
                  <span className="shop-map-world-figure">{money(niche.revenueMinor)}</span>
                  <span className="shop-map-world-meta">
                    {niche.activeListings} active · {niche.orders}
                    {niche.orders === 1 ? " order" : " orders"} · {niche.reviews.lifetimeHeld} reviews
                  </span>
                  <span className="shop-map-bar" aria-hidden="true">
                    <span style={{ width: `${Math.max(2, Math.round(share * 100))}%` }} />
                  </span>
                  {niche.productFamilies.length
                    ? <span className="shop-map-families">
                        {niche.productFamilies.map(row => row.family).join(" · ")}
                      </span>
                    : null}
                  <span className="shop-map-lifetime">
                    Lifetime {money(niche.lifetimeRevenueMinor)} · {niche.lifetimeOrders} orders
                  </span>
                </button>
                {open === niche.worldId
                  ? <div className="shop-map-evidence">
                      <p>{niche.evidence}</p>
                      {niche.productFamilies.length
                        ? <p>Products: {niche.productFamilies
                            .map(row => `${row.family} (${row.listings})`).join(", ")}</p>
                        : null}
                      <p>{niche.listings} listings in total, {niche.activeListings} active.</p>
                    </div>
                  : null}
              </li>
            );
          })}
        </ul>
      </section>

      {/* 4 · Only what can be acted on. */}
      <section className="shop-map-card shop-map-attention">
        <h2>Needs attention</h2>
        <ul>
          {shown.unclassifiedPerformance?.activeListings
            ? <li>{shown.unclassifiedPerformance.activeListings} active
              {shown.unclassifiedPerformance.activeListings === 1 ? " listing isn’t" : " listings aren’t"}
              {" "}in a niche yet</li>
            : null}
          {(shown.needsAttention?.overbuiltWorlds ?? []).map(niche =>
            <li key={niche.label}>{niche.reason}</li>)}
          {!shown.unclassifiedPerformance?.activeListings
            && !(shown.needsAttention?.overbuiltWorlds ?? []).length
            ? <li className="shop-map-clear">Nothing needs your attention.</li> : null}
        </ul>
      </section>

      {/* Correction: move one listing, recomputed with no duplication. */}
      <section className="shop-map-card">
        <h2>Fix a listing</h2>
        <p className="shop-map-reason">
          Look up a listing to see which niche it is in and why, then move it if
          that is wrong. Its orders and revenue move with it.
        </p>
        {correctionFailed && (
          <p className="p-notice p-notice-bad shop-map-correction-failed" role="alert">
            {correctionFailed}
          </p>
        )}
        <MoveControl niches={niches} busy={busy} onMove={moveListing}
          onClear={clearCorrection} />
      </section>
      {signedInEmail ? null : null}
    </main>
  );
}

type Placement = { listingId: number; title: string; nicheId: string;
  nicheLabel: string; corrected: boolean; why: string };

function MoveControl(
  { niches, busy, onMove, onClear }:
  { niches: Niche[]; busy: string;
    onMove: (listingId: number, nicheId: string) => Promise<void>;
    onClear: (listingId: number) => Promise<void> },
) {
  const [listingId, setListingId] = useState("");
  const [nicheId, setNicheId] = useState("unclassified");
  /*
    CORRECTING SOMETHING YOU CANNOT SEE THE REASON FOR IS GUESSING.

    A member could already move a listing, but nothing on the page told them
    where the listing currently sits or why. Looking it up first is a read:
    it changes nothing, and the sentence it shows is built on the server so
    this component never handles the wording behind a placement.
  */
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [lookupFailed, setLookupFailed] = useState("");
  const [looking, setLooking] = useState(false);

  const look = async (id: string) => {
    setLooking(true);
    setPlacement(null);
    setLookupFailed("");
    try {
      const response = await fetch(`/api/shop-map/map?listingId=${encodeURIComponent(id)}`);
      if (!response.ok) {
        setLookupFailed("That listing could not be looked up just now. Nothing was changed.");
      } else {
        const body = await response.json() as { placement?: Placement | null };
        if (body.placement) {
          setPlacement(body.placement);
          setNicheId(body.placement.nicheId || "unclassified");
        } else {
          setLookupFailed(`Listing ${id} is not in this shop's map. Check the ID on `
            + `Etsy — it is the number in the listing's own URL.`);
        }
      }
    } catch {
      setLookupFailed("That listing could not be looked up just now. Nothing was changed.");
    }
    setLooking(false);
  };

  const working = busy.startsWith("move:");
  return (
    <div className="shop-map-move">
      <label>
        <span>Etsy listing ID</span>
        <input inputMode="numeric" value={listingId} placeholder="e.g. 1234567890"
          onChange={event => {
            setListingId(event.target.value.replace(/[^0-9]/g, ""));
            setPlacement(null);
            setLookupFailed("");
          }} />
      </label>
      <button type="button" className="shop-map-look" disabled={!listingId || looking}
        onClick={() => void look(listingId)}>
        {looking ? "Looking…" : "Where is it now?"}
      </button>
      {lookupFailed && (
        <p className="p-notice p-notice-bad shop-map-lookup-failed" role="alert">
          {lookupFailed}
        </p>
      )}
      {placement && (
        <div className="shop-map-placement">
          {placement.title && <p className="shop-map-placement-title">{placement.title}</p>}
          <p className="shop-map-placement-where">
            In <strong>{placement.nicheLabel}</strong>
            {placement.corrected ? " — your correction" : ""}
          </p>
          <p className="shop-map-placement-why">{placement.why}</p>
          {placement.corrected && (
            /*
              A correction made by mistake was permanent. Moving the listing
              to Unclassified is not the same thing — that is a member saying
              it belongs nowhere, which is itself a correction.
            */
            <button type="button" className="shop-map-clear-correction"
              disabled={busy.startsWith("clear:")}
              onClick={() => void (async () => {
                await onClear(placement.listingId);
                await look(String(placement.listingId));
              })()}>
              {busy.startsWith("clear:") ? "Clearing…" : "Use the automatic placement instead"}
            </button>
          )}
        </div>
      )}
      <label>
        <span>Move to</span>
        <select value={nicheId} onChange={event => setNicheId(event.target.value)}>
          {niches.filter(niche => niche.worldId !== "unclassified").map(niche =>
            <option key={niche.worldId} value={niche.worldId}>{niche.label}</option>)}
          <option value="unclassified">Unclassified</option>
        </select>
      </label>
      <button type="button" disabled={!listingId || working}
        onClick={() => void (async () => {
          await onMove(Number(listingId), nicheId);
          /*
            The panel above described where the listing WAS. Leaving it there
            after a move would state the old niche beside a map that now
            shows the new one, so it is read again rather than kept.
          */
          if (placement) await look(listingId);
        })()}>
        {working ? "Moving…" : "Move listing"}
      </button>
    </div>
  );
}
