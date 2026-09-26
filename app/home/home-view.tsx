"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * THE HOME PAGE'S CONTENT, MOUNTABLE ON ITS OWN.
 *
 * Split out of the route so the state preview can render the real page -
 * markup, stylesheets and all - against fixtures. A page only the production
 * server can draw is a page nobody can check at a phone width without a
 * member's session.
 *
 * ---------------------------------------------------------------------------
 * WHAT CHANGED, AND WHY THE GREETING WENT.
 *
 * This opened with "Good morning." over the date. A clock reading is the one
 * thing on a seller's screen they already know, and it took the largest type
 * on the page to say it. The approved design gives that space to the shop:
 * its name, at display size, with its own mark beside it. That is the only
 * line here that is about them.
 *
 * The two hero cards became one. "Create a listing or batch" and "Continue
 * your work" were the same product wearing two cards, while Batch History,
 * Keyword Banks, Mockup Sets and Usage - the rest of that same product - were
 * not on this page at all. They are all one card now, with the batch button
 * where it has always been and the four surfaces underneath it, so the home
 * page finally shows the whole of the Listing Factory rather than its front
 * door twice.
 */
const stroke = {
  fill: "none", stroke: "currentColor", strokeWidth: 1.6,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};
const icon = (children: React.ReactNode) =>
  <svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true">{children}</svg>;

const FACTORY = [
  { href: "/batches", name: "Batch History", what: "Open previous and in-progress batches",
    icon: icon(<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M3 7l2-3h14l2 3M9 12h6" /></>) },
  { href: "/keywords", name: "Keyword Banks", what: "Save reusable titles, tags and keywords",
    icon: icon(<><circle cx="8" cy="14" r="4" /><path d="m11 11 8-8M16 6l2 2M19 3l2 2" /></>) },
  { href: "/mockups", name: "Mockup Sets", what: "Manage saved product mockups",
    icon: icon(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m3 16 5-5 4 4 3-3 6 6" /><circle cx="8.5" cy="8.5" r="1.4" /></>) },
  { href: "/usage", name: "Usage", what: "See your monthly listing allowance and goal",
    icon: icon(<><circle cx="12" cy="13" r="8" /><path d="M12 13V8" /></>) },
];

/*
  SHOP WATCH IS NOT HERE, AND THAT IS NOT AN OVERSIGHT.

  The approved design shows a Shop Watch tile in this group. The feature is
  real but it is behind SHOP_WATCH_FLAG with no page of its own yet, so a tile
  would be a link to a 404 - the one thing worse than a missing tile. It goes
  in when the page does.

  Design Scanner was here and is gone: its listing check moved onto the
  listing in Shop Map, where the listings already were, and its artwork scan
  needed a cohort that mostly did not exist.
*/
const TOOLS = [
  { href: "/market-watch", name: "Market Watch", what: "Tracked niches and daily activity",
    icon: icon(<><path d="M3 17l6-6 4 4 7-7" /><path d="M14 8h7v7" /></>) },
  { href: "/market-watch/research", name: "Niche Research", what: "Find ten niche shops and follow ongoing buyer insights",
    icon: icon(<><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6M10 7v6M7 10h6" /></>) },
  { href: "/shop-map", name: "Shop Map", what: "Listings, product themes and your shop numbers",
    icon: icon(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>) },
  { href: "/trademark", name: "Trademark Tracker", what: "Phrase checks and saved watchlists",
    icon: icon(<><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" /><path d="m9 12 2 2 4-4" /></>) },
];

function initialsOf(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

export default function HomeView() {
  const [shop, setShop] = useState<string | null>(null);
  const [shopRead, setShopRead] = useState(false);
  /*
    THE ACCOUNT'S NAME FIRST, THE ETSY SHOP SECOND.

    /api/etsy returns what Etsy stores as shop_name, which is the shop's URL
    handle: "shesawolfclothing". Printed at display size that is not a name,
    it is a slug, and there is no reliable way to put the apostrophes and the
    capitals back into one. The account's own display name is the same shop
    written the way its owner writes it, so it leads and the handle is the
    fallback for an account that has not set one.
  */
  useEffect(() => {
    void Promise.all([
      fetch("/api/account").then(response => response.json() as Promise<{ name?: string }>).catch(() => ({} as { name?: string })),
      fetch("/api/etsy").then(response => response.json() as Promise<{ shopName?: string }>).catch(() => ({} as { shopName?: string })),
    ]).then(([account, etsy]) => {
      setShop(account.name || etsy.shopName || null);
      setShopRead(true);
    /* No name is a state, not a failure: the heading falls back rather than
       the page showing an error for something it only decorates. */
    }).catch(() => setShopRead(true));
  }, []);
  /* Nothing is printed until the read settles, so the heading never flips from
     a fallback to the shop's name in front of the member. */
  const heading = !shopRead ? "" : shop || "Welcome back";

  return <>
  <main className="hub p-grid home-dashboard">
    <header className="home-shop-head">
      <span className="home-shop-mark" aria-hidden="true">{shop ? initialsOf(shop) : ""}</span>
      <h1>{heading}</h1>
    </header>

    <section className="home-panel" aria-labelledby="home-factory-title">
      <div className="home-panel-head">
        <span className="home-panel-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="24" height="24" {...stroke}>
            <path d="M3 20V9l5 4V9l5 4V9l5 4V4h3v16z" /><path d="M8 17h.01M12 17h.01M16 17h.01" /></svg>
        </span>
        <span className="home-panel-copy">
          <small>LISTING FACTORY</small>
          <h2 id="home-factory-title">Create and manage listings</h2>
        </span>
        <Link className="home-panel-cta" href="/listing-factory?step=setup">
          Start a new batch <i aria-hidden="true">↗</i></Link>
      </div>
      <div className="home-panel-tiles home-panel-tiles-four">
        {FACTORY.map(tile => <Link key={tile.name} className="home-tile" href={tile.href}>
          <span className="home-tile-icon" aria-hidden="true">{tile.icon}</span>
          <span className="home-tile-copy"><b>{tile.name}</b><small>{tile.what}</small></span>
          <i className="home-tile-go" aria-hidden="true">›</i>
        </Link>)}
      </div>
    </section>

    <section className="home-panel" aria-labelledby="home-tools-title">
      <div className="home-panel-head">
        <span className="home-panel-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="24" height="24" {...stroke}>
            <path d="M5 20V10M12 20V4M19 20v-7" /></svg>
        </span>
        <span className="home-panel-copy">
          <small>COMMAND CENTER</small>
          <h2 id="home-tools-title">Open a tool</h2>
        </span>
        {/* D1787 · The Command Center has its own page now, where each tool is
            presented by the question it answers. This card lists the same four
            destinations; the heading is the way through to the fuller one
            rather than a second, thinner copy of it with no link out. */}
        <Link className="home-panel-cta" href="/command-center">
          Open the Command Center <i aria-hidden="true">↗</i></Link>
      </div>
      <div className="home-panel-tiles home-panel-tiles-two">
        {TOOLS.map(tile => <Link key={tile.name} className="home-tile" href={tile.href}>
          <span className="home-tile-icon" aria-hidden="true">{tile.icon}</span>
          <span className="home-tile-copy"><b>{tile.name}</b><small>{tile.what}</small></span>
          <i className="home-tile-go" aria-hidden="true">›</i>
        </Link>)}
      </div>
    </section>

    <section className="home-panel home-panel-single">
      <Link className="home-tile" href="/connections">
        <span className="home-tile-icon" aria-hidden="true">
          {icon(<><path d="M10 14a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" /></>)}
        </span>
        <span className="home-tile-copy"><b>Connections</b><small>Manage Etsy, Printify and your photo library</small></span>
        <i className="home-tile-go" aria-hidden="true">›</i>
      </Link>
    </section>

    <footer className="hub-foot">
      <p className="etsy-api-disclosure">
        The term &apos;Etsy&apos; is a trademark of Etsy, Inc. This application uses the
        Etsy API but is not endorsed or certified by Etsy, Inc.
      </p>
    </footer>
  </main>
  </>;
}
