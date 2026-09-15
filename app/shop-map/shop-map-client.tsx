"use client";
import { useEffect, useState } from "react";

type World = { worldId: string; label: string; listings: number; activeListings: number;
  orders: number; units: number; revenueMinor: number; recentOrders90: number; evidence: string };
type Map = {
  shop?: { shopName: string };
  month?: string;
  thisMonth?: { revenueMinor: number; etsyFeesMinor: number; productionCostMinor: number;
    headline: string; profitMinor: number | null; accuracy: string; orders: number };
  pointingHere?: { label: string; finding: string; reason: string };
  worlds?: World[];
  needsAttention?: { unclassifiedListings: number; missingProductionCosts: number;
    overbuiltWorlds: Array<{ label: string; reason: string }> };
  error?: string;
};

const money = (minor: number | null | undefined) =>
  minor === null || minor === undefined ? "—"
    : `${minor < 0 ? "-" : ""}$${Math.abs(minor / 100).toLocaleString(undefined,
      { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ShopMapClient({ signedInEmail }: { signedInEmail?: string }) {
  const [map, setMap] = useState<Map | null>(null);
  const [open, setOpen] = useState<string>("");

  useEffect(() => {
    void fetch("/api/shop-map/map")
      .then(response => response.json() as Promise<Map>)
      .then(setMap)
      .catch(() => setMap({ error: "Shop Map could not load." }));
  }, []);

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
      <section className="shop-map-card shop-map-money">
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
      </section>

      {/* 2 · One direction, with the reason always attached. */}
      <section className="shop-map-card shop-map-direction">
        <h2>Your shop is pointing here</h2>
        <p className="shop-map-world-name">{map.pointingHere?.label}</p>
        <p className="shop-map-reason">{map.pointingHere?.reason}</p>
      </section>

      {/* 3 · The worlds, stacked for a phone. Tap for the evidence. */}
      <section className="shop-map-card">
        <h2>Your worlds</h2>
        <ul className="shop-map-worlds">
          {(map.worlds ?? []).map(world => {
            const shareOfRevenue = totalRevenue ? world.revenueMinor / totalRevenue : 0;
            return (
              <li key={world.worldId}>
                <button type="button" className="shop-map-world"
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
                </button>
                {open === world.worldId
                  ? <p className="shop-map-evidence">{world.evidence}</p>
                  : null}
              </li>
            );
          })}
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
