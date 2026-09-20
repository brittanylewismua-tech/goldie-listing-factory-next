"use client";

import { useEffect, useState } from "react";

type Listing = { listingId: number; title: string; imageUrl: string; favorites: number;
  sales: number; revenueMinor: number; currency: string };
type Blocks = {
  connections?: { needs: string | null; say?: string };
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
  useEffect(() => { void fetch("/api/home").then(async response => {
    if (response.ok) setBlocks(((await response.json()) as { blocks: Blocks }).blocks);
  }).catch(() => undefined); }, []);
  if (!blocks) return <section className="home-signal home-signal-loading" aria-label="Loading shop summary" />;

  const ranked = blocks.topListings;
  const hasSales = ranked?.rankedBy === "sales";
  return <>
    {blocks.connections?.needs && <a className="home-alert" href="/connections">
      <b>Your Etsy connection needs attention.</b><span>{blocks.connections.say} Open Connections</span>
    </a>}

    <section className="home-signal">
      <div className="home-signal-heading">
        <div><p className="mini-label">YOUR CLEAREST SIGNAL</p>
          <h2>Your top listings in the last 30 days.</h2>
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
        <b>Your listing leaders will appear here.</b>
        <p>Once Etsy sales or favorites are available, Goldie will rank the top three for you.</p>
      </div>}
    </section>

    <section className="home-metrics" aria-label="Shop summary">
      <article><span>This month</span><strong>{blocks.thisMonth
        ? money(blocks.thisMonth.revenueMinor, blocks.thisMonth.currency) : "Not available"}</strong>
        <small>{blocks.thisMonth ? `${blocks.thisMonth.orders} order${blocks.thisMonth.orders === 1 ? "" : "s"}` : "Connect sales to see revenue"}
          {blocks.thisMonth && blocks.thisMonth.stale && blocks.thisMonth.asOfDay ? ` · through ${blocks.thisMonth.asOfDay}` : ""}</small></article>
      <article><span>Estimated profit</span><strong>{blocks.thisMonth?.profitAvailable
        ? money(blocks.thisMonth.profitMinor ?? 0, blocks.thisMonth.currency) : "Needs costs"}</strong>
        <small>{blocks.thisMonth?.profitAvailable ? "After known costs" : "Add production costs in Shop Map"}</small></article>
      <article><span>Listing Factory</span><strong>{blocks.factory?.openDrafts ?? 0}</strong>
        <small>draft{blocks.factory?.openDrafts === 1 ? "" : "s"} in progress</small></article>
      <article><span>Design Scanner</span><strong>{blocks.scansLeft
        ? `${blocks.scansLeft.remaining} left` : "Ready"}</strong>
        <small>{blocks.scansLeft ? "Resets daily" : "Open the scanner"}</small></article>
    </section>
  </>;
}
