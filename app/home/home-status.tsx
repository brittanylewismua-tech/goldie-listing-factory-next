"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Listing = { listingId: number; title: string; imageUrl: string; favorites: number;
  sales: number; revenueMinor: number; currency: string };
type Blocks = {
  connections?: { needs: string | null; say?: string; activeShop?: string; connected?: boolean };
  thisMonth?: { revenueMinor: number; currency: string; orders: number;
    stale?: boolean; asOfDay?: string; profitMinor: number | null; profitAvailable: boolean };
  topListings?: { period: string; rankedBy: "sales" | "favorites"; listings: Listing[] };
  niches?: Array<{ phrase: string; newly: number }>;
  scansLeft?: { remaining: number; limit: number };
  factory?: { openDrafts: number };
};

const money = (minor: number, currency = "USD") => new Intl.NumberFormat("en-US", {
  style: "currency", currency, maximumFractionDigits: 0,
}).format(minor / 100);

function ListingArt({ listing }: { listing: Listing }) {
  return listing.imageUrl
    ? <img src={listing.imageUrl} alt="" loading="lazy" width={570} height={570} />
    : <span className="home-listing-placeholder" aria-hidden="true"><i />G</span>;
}

export default function HomeStatus() {
  const [blocks, setBlocks] = useState<Blocks | null>(null);
  const [syncing, setSyncing] = useState(false);
  const importStarted = useRef(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/home");
    if (!response.ok) return null;
    const next = ((await response.json()) as { blocks: Blocks }).blocks;
    setBlocks(next);
    return next;
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!blocks || blocks.topListings?.listings.length || importStarted.current) return;
    importStarted.current = true;
    let alive = true;
    const post = async (url: string) => {
      const response = await fetch(url, { method: "POST" });
      if (!response.ok) throw new Error("The shop import did not finish.");
    };
    void (async () => {
      try {
        const capabilityResponse = await fetch("/api/shop-map/capability");
        if (!capabilityResponse.ok) return;
        const capability = await capabilityResponse.json() as { connected?: boolean; canReadSales?: boolean };
        if (!capability.connected) return;
        if (!alive) return;
        setSyncing(true);
        /* Put the actual listings and images on screen first. Sales history is
           the slower pass and updates the same cards as it arrives. */
        await post("/api/shop-map/listings?pages=20&listings=1");
        if (alive) await load();
        if (capability.canReadSales) {
          for (let salesFrom = 0; salesFrom < 40; salesFrom += 8)
            await post(`/api/shop-map/listings?sales=1&salesFrom=${salesFrom}&receipts=8`);
          if (alive) await load();
        }
      } catch { /* the page keeps its honest empty state */ }
      finally { if (alive) setSyncing(false); }
    })();
    return () => { alive = false; };
  }, [blocks, load]);
  if (!blocks) return <section className="home-signal home-signal-loading" aria-label="Loading shop summary" />;

  const ranked = blocks.topListings;
  const hasSales = ranked?.rankedBy === "sales";
  const connectedShop = blocks.connections?.activeShop?.toLowerCase() === "shesawolfclothing"
    ? "She’s a Wolf" : blocks.connections?.activeShop ?? "Your Etsy shop";
  return <>
    {blocks.connections?.needs && <a className="home-alert" href="/connections">
      <b>Your Etsy connection needs attention.</b><span>{blocks.connections.say} Open Connections</span>
    </a>}

    <section className="home-shop-identity" aria-label="Connected Etsy shop">
      <span className="home-connected-dot" aria-hidden="true" />
      <div><small>CONNECTED ETSY SHOP</small><strong>{connectedShop}</strong></div>
      <span>Connected</span>
    </section>

    <section className="home-metrics" aria-label="Shop summary">
      <article><span>30-day revenue</span><strong>{blocks.thisMonth
        ? money(blocks.thisMonth.revenueMinor, blocks.thisMonth.currency) : "Pending"}</strong>
        <small>{blocks.thisMonth ? `${blocks.thisMonth.orders} order${blocks.thisMonth.orders === 1 ? "" : "s"}` : "Sales import in progress"}
          {blocks.thisMonth && blocks.thisMonth.stale && blocks.thisMonth.asOfDay
            ? ` · through ${blocks.thisMonth.asOfDay}` : ""}</small></article>
      <article><span>Orders</span><strong>{blocks.thisMonth?.orders ?? "Pending"}</strong>
        <small>{blocks.thisMonth ? "This month" : "Sales import in progress"}</small></article>
      <article><span>Est. profit</span><strong>{blocks.thisMonth?.profitAvailable
        ? money(blocks.thisMonth.profitMinor ?? 0, blocks.thisMonth.currency) : "Needs costs"}</strong>
        <small>{blocks.thisMonth?.profitAvailable ? "After known costs" : "Add production costs in Shop Map"}</small></article>
      <article><span>Listing Factory</span><strong>{blocks.factory?.openDrafts ?? 0}</strong>
        <small>draft{blocks.factory?.openDrafts === 1 ? "" : "s"} in progress</small></article>
    </section>

    <section className="home-signal">
      <div className="home-signal-heading">
        <div><p className="mini-label">LAST 30 DAYS</p>
          <h2>Top three listings</h2>
          <p>{hasSales
            ? "Ranked by the number sold."
            : "No recent sales yet, so these are ranked by customer favorites."}</p></div>
        <a href="/shop-map">See all sold listings <span aria-hidden="true">↗</span></a>
      </div>
      {ranked?.listings.length ? <div className="home-listing-grid">
        {ranked.listings.map((listing, index) => <article key={listing.listingId}
          className={index === 0 ? "home-listing-card lead" : "home-listing-card"}>
          <div className="home-listing-art"><ListingArt listing={listing}/>
            <span className="home-listing-rank">0{index + 1}</span></div>
          <div className="home-listing-copy"><p>{listing.title}</p>
            <div><strong>{hasSales ? `${listing.sales} sold` : `${listing.favorites} favorites`}</strong>
              {hasSales && listing.revenueMinor > 0
                ? <span>{money(listing.revenueMinor, listing.currency)}</span> : null}</div>
          </div>
        </article>)}
      </div> : <div className="home-listing-empty">
        <b>{syncing ? "Loading your She’s a Wolf listings…" : "Your listing leaders will appear here."}</b>
        <p>{syncing ? "Goldie is importing your real listing images and sales now."
          : "Goldie will rank your top three by sales, or by favorites when there are no recent sales."}</p>
      </div>}
    </section>
  </>;
}
