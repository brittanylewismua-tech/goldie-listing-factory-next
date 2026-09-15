"use client";
import { useEffect, useState } from "react";

type World = { worldId: string; label: string; listings: number; activeListings: number;
  period: string; orders: number; revenueMinor: number; lifetimeOrders: number;
  lifetimeRevenueMinor: number; evidence: string;
  productFamilies: Array<{ family: string; listings: number }>;
  reviews: { recent: number; lifetimeHeld: number } };
type Focus = { nicheId: string; label: string; headline: string; advice: string; reason: string };
type Map = {
  shop?: { shopName: string };
  month?: string;
  thisMonth?: { revenueMinor: number; etsyFeesMinor: number; productionCostMinor: number;
    headline: string; profitMinor: number | null; accuracy: string; orders: number };
  whereToFocus?: Focus[];
  worlds?: World[];
  worldsPeriod?: string;
  needsAttention?: { unclassifiedListings: number; missingProductionCosts: number;
    overbuiltWorlds: Array<{ label: string; reason: string }> };
  timezoneNeeded?: boolean;
  error?: string;
};

const money = (minor: number | null | undefined) =>
  minor === null || minor === undefined ? "—"
    : `${minor < 0 ? "-" : ""}$${Math.abs(minor / 100).toLocaleString(undefined,
      { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ShopMapClient({ signedInEmail }: { signedInEmail?: string }) {
  const [map, setMap] = useState<Map | null>(null);
  const [open, setOpen] = useState<string>("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    void fetch("/api/shop-map/map")
      .then(response => response.json() as Promise<Map>)
      .then(setMap)
      .catch(() => setMap({ error: "Shop Map could not load." }));
  }, []);

  /*
    The browser knows where the member is; Goldie asks rather than assumes.
    A timezone is only ever stored for THIS member's THIS shop, and only
    after they say yes - month boundaries move real money between months.
  */
  const detected = typeof Intl !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";

  const confirmTimezone = async () => {
    setConfirming(true);
    await fetch(`/api/shop-map/financial/settings?timezone=${encodeURIComponent(detected)}`
      + `&detected=${encodeURIComponent(detected)}`).catch(() => undefined);
    const refreshed = await fetch("/api/shop-map/map")
      .then(response => response.json() as Promise<Map>).catch(() => null);
    if (refreshed) setMap(refreshed);
    setConfirming(false);
  };

  if (!map) return <main className="shop-map"><p className="shop-map-loading">Reading your shop…</p></main>;
  if (map.error) return <main className="shop-map"><p className="shop-map-loading">{map.error}</p></main>;

  const month = map.thisMonth;
  const totalRevenue = (map.worlds ?? []).reduce((sum, world) => sum + world.revenueMinor, 0);

  return (
    <main className="shop-map">
      <header className="shop-map-head">
        <h1>{map.shop?.shopName ?? "Your shop"}</h1>
        <p>{map.month}</p>
      </header>

      {/* 1 · This month. One headline number, never two competing. */}
      {map.timezoneNeeded
        ? <section className="shop-map-card shop-map-timezone">
            <h2>This month</h2>
            <p className="shop-map-reason">
              Monthly figures need to know where your shop trades, because a month
              starts and ends at a different moment in each place.
            </p>
            {detected
              ? <button type="button" className="shop-map-confirm"
                  disabled={confirming} onClick={() => void confirmTimezone()}>
                  {confirming ? "Saving…" : `My shop runs on ${detected}`}
                </button>
              : <p className="shop-map-reason">Set your shop timezone to see monthly figures.</p>}
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

      {/* 2 · The map itself. Size shows strength at a glance. */}
      <section className="shop-map-card">
        <h2>Your shop map</h2>
        {/* Never a figure without its period. */}
        <p className="shop-map-period">{map.worldsPeriod}</p>
        <ul className="shop-map-worlds">
          {(map.worlds ?? []).map(world => {
        const shareOfRevenue = totalRevenue ? world.revenueMinor / totalRevenue : 0;
            return (
              <li key={world.worldId}>
                <button type="button"
                  className={shareOfRevenue >= 0.25 ? "shop-map-world shop-map-world-strong"
                    : shareOfRevenue >= 0.1 ? "shop-map-world shop-map-world-mid"
                    : "shop-map-world"}
                  aria-expanded={open === world.worldId}
                  onClick={() => setOpen(open === world.worldId ? "" : world.worldId)}>
                  <span className="shop-map-world-label">{world.label}</span>
                  <span className="shop-map-world-figure">{money(world.revenueMinor)}</span>
                  <span className="shop-map-world-meta">
                    {world.activeListings} active · {world.orders}
                    {world.orders === 1 ? " order" : " orders"} ·
                    {` ${Math.round(shareOfRevenue * 100)}% of revenue`}
                  </span>
                  <span className="shop-map-bar" aria-hidden="true">
                    <span style={{ width: `${Math.max(2, Math.round(shareOfRevenue * 100))}%` }} />
                  </span>
                  {world.productFamilies.length
                    ? <span className="shop-map-families">{world.productFamilies
                        .map(row => row.family).join(" · ")}</span>
                    : null}
                </button>
                {open === world.worldId
                  ? <div className="shop-map-evidence">
                      <p>{world.evidence}</p>
                      {world.productFamilies.length
                        ? <p>Products: {world.productFamilies
                            .map(row => `${row.family} (${row.listings})`).join(", ")}</p>
                        : null}
                      {world.reviews.lifetimeHeld
                        ? <p>{world.reviews.recent} reviews in the last 90 days,
                            {` ${world.reviews.lifetimeHeld}`} held in total</p>
                        : null}
                      <p>Lifetime: {money(world.lifetimeRevenueMinor)} from
                        {` ${world.lifetimeOrders}`} orders</p>
                    </div>
                  : null}
              </li>
            );
          })}
        </ul>
      </section>

      {/* 3 · What to do next, each with the arithmetic that produced it. */}
      <section className="shop-map-card">
        <h2>Where to focus</h2>
        <ul className="shop-map-focus">
          {(map.whereToFocus ?? []).map(row => (
            <li key={row.nicheId}>
              <span className="shop-map-focus-head">{row.headline}</span>
              <span className="shop-map-focus-advice">{row.advice}</span>
              <span className="shop-map-focus-reason">{row.reason}</span>
            </li>
          ))}
          {!(map.whereToFocus ?? []).length
            ? <li className="shop-map-clear">Not enough evidence to guide you yet.</li> : null}
        </ul>
      </section>

      {/* 4 · Only things the member can act on. Not an error log. */}
      <section className="shop-map-card shop-map-attention">
        <h2>Needs attention</h2>
        <ul>
          {map.needsAttention?.unclassifiedListings
            ? <li>{map.needsAttention.unclassifiedListings}{" "}
              {map.needsAttention.unclassifiedListings === 1 ? "listing isn’t" : "listings aren’t"}
              {" "}in a world yet</li> : null}
          {map.needsAttention?.missingProductionCosts
            ? <li>{map.needsAttention.missingProductionCosts}{" "}
              {map.needsAttention.missingProductionCosts === 1 ? "order has" : "orders have"}
              {" "}no production cost</li> : null}
          {(map.needsAttention?.overbuiltWorlds ?? []).map(world =>
            <li key={world.label}>{world.reason}</li>)}
          {!map.needsAttention?.unclassifiedListings
            && !map.needsAttention?.missingProductionCosts
            && !(map.needsAttention?.overbuiltWorlds ?? []).length
            ? <li className="shop-map-clear">Nothing needs your attention.</li> : null}
        </ul>
      </section>
      {signedInEmail ? null : null}
    </main>
  );
}
