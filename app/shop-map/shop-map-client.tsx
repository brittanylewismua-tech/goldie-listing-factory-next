"use client";
import { useEffect, useState } from "react";

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
    coverage?: { verified: number; estimated: number; unavailable: number } };
  standout?: { hasStandout: boolean; headline: string; nextStep: string };
  whereToFocus?: Focus[];
  worlds?: Niche[];
  unclassifiedCard?: Niche;
  worldsPeriod?: string;
  directionCaveat?: string;
  coverage?: { activeListings: number; recentRevenue: number; recentOrders: number };
  unclassifiedPerformance?: { listings: number; activeListings: number; orders: number;
    revenueMinor: number; reviews: number; ordersLast90: number; revenueLast90Minor: number };
  needsAttention?: { overbuiltWorlds: Array<{ label: string; reason: string }> };
  shopTotals?: { listings: number; orders: number };
  timezoneNeeded?: boolean;
  error?: string;
};

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
    The browser knows where the member is; Goldie asks rather than assumes.
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

  const moveListing = async (listingId: number, nicheId: string) => {
    setBusy(`move:${listingId}`);
    await fetch("/api/shop-map/correct", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "move-listing", listingId,
        worldIds: nicheId === "unclassified" ? [] : [nicheId] }) }).catch(() => undefined);
    await load();
    setBusy("");
  };

  const shown = map ?? lastGood;

  if (!shown && failed)
    return <main className="shop-map"><p className="shop-map-state">
      Shop Map could not load just now. Nothing has changed — try again in a moment.
    </p></main>;
  if (!shown)
    return <main className="shop-map"><p className="shop-map-state">Organizing your shop…</p></main>;

  const month = shown.thisMonth;
  const niches = [...(shown.worlds ?? [])];
  if (shown.unclassifiedCard?.listings) niches.push(shown.unclassifiedCard);
  const recentTotal = niches.reduce((sum, niche) => sum + niche.revenueMinor, 0);
  const noSalesYet = (shown.shopTotals?.orders ?? 0) === 0;

  return (
    <main className="shop-map">
      <header className="shop-map-head">
        <h1>{shown.shop?.shopName ?? "Your shop"}</h1>
        <p>{shown.month}</p>
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
            <p className="shop-map-figure">{money(month?.profitMinor)}</p>
            <p className="shop-map-accuracy">{month?.accuracy}</p>
            <dl className="shop-map-rows">
              <div><dt>Revenue</dt><dd>{money(month?.revenueMinor)}</dd></div>
              <div><dt>Etsy fees</dt><dd>{money(month?.etsyFeesMinor)}</dd></div>
              <div><dt>Production</dt><dd>{money(month ? -month.productionCostMinor : 0)}</dd></div>
              <div><dt>Orders</dt><dd>{month?.orders ?? 0}</dd></div>
            </dl>
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
        {shown.directionCaveat
          ? <p className="shop-map-caveat">{shown.directionCaveat}</p> : null}
      </section>

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
          Put a listing in the right niche. Its orders and revenue move with it.
        </p>
        <MoveControl niches={niches} busy={busy} onMove={moveListing} />
      </section>
      {signedInEmail ? null : null}
    </main>
  );
}

function MoveControl(
  { niches, busy, onMove }:
  { niches: Niche[]; busy: string; onMove: (listingId: number, nicheId: string) => Promise<void> },
) {
  const [listingId, setListingId] = useState("");
  const [nicheId, setNicheId] = useState("unclassified");
  const working = busy.startsWith("move:");
  return (
    <div className="shop-map-move">
      <label>
        <span>Etsy listing ID</span>
        <input inputMode="numeric" value={listingId} placeholder="e.g. 1234567890"
          onChange={event => setListingId(event.target.value.replace(/[^0-9]/g, ""))} />
      </label>
      <label>
        <span>Move to</span>
        <select value={nicheId} onChange={event => setNicheId(event.target.value)}>
          {niches.filter(niche => niche.worldId !== "unclassified").map(niche =>
            <option key={niche.worldId} value={niche.worldId}>{niche.label}</option>)}
          <option value="unclassified">Unclassified</option>
        </select>
      </label>
      <button type="button" disabled={!listingId || working}
        onClick={() => void onMove(Number(listingId), nicheId)}>
        {working ? "Moving…" : "Move listing"}
      </button>
    </div>
  );
}
