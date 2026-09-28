"use client";

import { useEffect, useRef, useState } from "react";
import FactoryShell from "../factory-shell";
import { decodeEntities } from "../shop-map-worlds";

/** Observed listing changes for product research; never a competitor sales report. */

type Listing = {
  listingId: number; title: string; url: string; image: string | null;
  price: number | null; currency: string;
  sold: number; savesGained: number; soldOut: boolean; product: string; attribution: string | null;
};
type Hit = { listingId: number; title: string; url: string; image: string | null;
  price: number | null; currency: string; sold: number; savesGained?:number; product: string };
type Board = {
  night: string | null; totalSold: number; hoursBack: number; coveredHours: number;
  building: boolean; unlocked: boolean; held: number; toUnlock: number;
  products: { key: string; label: string; sold: number; listings: number }[];
  listings: Listing[];
};

/**
 * ONLY OFFER A PERIOD THAT CAN BE HONOURED.
 *
 * The first version of this offered "This week" from day one and wrote "sold
 * this week" under every number, which claimed six days nobody was watching.
 * The repair was worse than the fault: it printed the true span instead —
 * "sold in 2 days" — which is our start date leaking onto the page. A seller
 * has no idea we only began counting on Tuesday, and no reason to care. All
 * they can read from it is that something is oddly wrong with the tool.
 *
 * So a period is offered when it exists and not before. "This week" appears
 * the day there is a week behind it, and until then the page simply does not
 * mention weeks. Every word stays true and none of it is about us.
 *
 * The period is stated ONCE, by the selected tab. Repeating it on four hundred
 * cards was noise even when it was accurate.
 */
const VIEWS = [
  { key: "overnight", hours: 24, tab: "Overnight" },
  { key: "week", hours: 168, tab: "This week" },
];

const money = (value: number | null, currency: string) =>
  value === null ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);

export default function HotListPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  /*
    D1906 · Arriving from "T-shirts sold 698 times" now lands on T-shirts.
    The row linked to a bare /hot-list, which opened on everything and left the
    reader to find the product they had just clicked.
  */
  const [product, setProduct] = useState(() => {
    if (typeof window === "undefined") return "all";
    return new URLSearchParams(window.location.search).get("product") || "all";
  });
  const [view, setView] = useState(VIEWS[0]);
  /* Which periods there is enough history to answer. Never shown, only used
     to decide what may be asked for. */
  const [covered, setCovered] = useState(0);
  /*
    MADE TO ORDER IS A DIFFERENT BUSINESS.

    Thirty-two of the top forty were personalised — name blankets, embroidered
    totes, custom logo tees. A seller printing a design on a blank cannot use
    any of it, and worse, it crowds out what they CAN use. Off by default, and
    offered rather than hidden, because for some sellers it is the whole point.
  */
  const [madeToOrder, setMadeToOrder] = useState(false);
  /*
    LICENSED AND TOUR MERCH. Twelve per cent of a live week's board, a third of
    the T-shirts shelf, and eight of the top twenty. Real sales on real
    listings, and none of it safe to copy.
  */
  const [rights, setRights] = useState(false);
  const [term, setTerm] = useState("");
  const [searchedTerm,setSearchedTerm]=useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [looking, setLooking] = useState(false);
  const [note, setNote] = useState("");

  const boardRequest=useRef(0),searchRequest=useRef(0);
  const load = (next = view, custom = madeToOrder, licensed = rights, preferLongest=false,
    keepProduct=false) => {
    const request=++boardRequest.current;++searchRequest.current;setLooking(false);
    setBoard(null); setError(""); setView(next); setHits(null); setNote("");
    setMadeToOrder(custom); setRights(licensed);
    /* no-store: an open tab must not reuse a board from before a repair. */
    fetch(`/api/sold-overnight?hours=${next.hours}`
      + `${custom ? "&madeToOrder=1" : ""}${licensed ? "&rights=1" : ""}`,
      { cache: "no-store" })
      .then(async response => {
        const result = await response.json() as Board & { error?: string };
        if (!response.ok) throw new Error(result.error || "This could not be loaded.");
        if(request!==boardRequest.current)return;
        setBoard(result);
        /* D1907 · The first load reset the filter to everything, which threw
           away the ?product= the reader arrived with: clicking T-shirts landed
           on T-shirts and then immediately un-filtered itself. Switching period
           or toggling a filter still resets, because those change what the
           board contains. */
        if (!keepProduct) setProduct("all");
        setCovered(result.coveredHours ?? 0);
        const list = VIEWS.filter(v => (result.coveredHours ?? 0) >= v.hours);
        /* The longest honourable period leads. Once a week of history exists
           this becomes the week, on its own, with nothing to announce. */
        const lead = list[list.length - 1];
        if (preferLongest && lead && lead.hours > next.hours) load(lead, custom, licensed);
      })
      .catch(e => {if(request===boardRequest.current)setError(e instanceof Error ? e.message : "This could not be loaded.")});
  };
  useEffect(() => { load(VIEWS[0],false,false,true,true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  /*
    LOOK A PHRASE UP AGAINST WHAT SOLD.

    Not gated. The unlock ladder is parked until the rest of the product is
    settled, but this is a tool rather than a reward and there is no reason a
    seller should have to earn the right to ask a question.
  */
  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!term.trim() || looking) return;
    const request=++searchRequest.current,keyword=term.trim();
    setLooking(true); setNote(""); setHits([]); setSearchedTerm(keyword);
    try {
      const response = await fetch(
        `/api/sold-overnight/search?keyword=${encodeURIComponent(term.trim())}&hours=${view.hours}${madeToOrder ? "&madeToOrder=1" : ""}${rights ? "&rights=1" : ""}&product=${encodeURIComponent(product)}`, { cache: "no-store" });
      const result = await response.json() as { listings?: Hit[]; error?: string };
      if (!response.ok) throw new Error(result.error || "That could not be looked up.");
      if(request!==searchRequest.current)return;
      setHits(result.listings ?? []);
      if (!result.listings?.length)
        setNote(`Nothing matching \u201c${term.trim()}\u201d has recorded activity in this period.`);
    } catch (error) {
      if(request===searchRequest.current)setNote(error instanceof Error ? error.message : "That could not be looked up.");
    } finally { if(request===searchRequest.current)setLooking(false); }
  }

  const shown = board
    ? [...(product === "all" ? board.listings : board.listings.filter(l => l.product === product))].sort((a,b)=>b.savesGained-a.savesGained)
    : [];

  /* Not "home": the Hot List is reached FROM home and is not it, and lighting
     Home while standing here says the rail cannot tell where you are. No rail
     item matches "hotlist", so nothing is lit. */
  return <FactoryShell active="hotlist" title="Hot List"><div className="drop-page sold-page interior-page">
    <header className="drop-head">
      <p className="mini-label">HOT LIST</p>
      {/*
          D1906 · "Recent listing activity" described nothing. The page is a
          record of what sold, counted from stock falling across the listings
          being watched, and the figure that brings a reader here is a number
          of units - so the heading has to be the same claim, or the two do not
          correspond and the link is a non sequitur.
      */}
      <h1>What sold on Etsy {view.hours >= 168 ? "this week" : "in the last 24 hours"}</h1>
      {/*
          D1906b · board.listings is capped, so printing its length claimed 400
          listings sold when 971 did. The product totals are the real count;
          the cap is stated separately rather than quietly standing in for it.
      */}
      <p>{board
        ? `${board.totalSold.toLocaleString("en-US")} units across ${
          board.products.reduce((sum, p) => sum + p.listings, 0).toLocaleString("en-US")} listings.${
          board.products.reduce((sum, p) => sum + p.listings, 0) > board.listings.length
            ? ` Showing the ${board.listings.length.toLocaleString("en-US")} with the most favorites gained.` : ""}`
        : "Loading."}</p>
    </header>

    {error && <section className="drop-error" role="alert">
      <h2>This could not be loaded</h2>
      <p>{error}</p>
      <button type="button" onClick={() => window.location.reload()}>Try again</button>
    </section>}

    {!board && !error && <section className="drop-loading">
      <p className="drop-loading-title">Loading listing activity</p>
      <span className="drop-loading-track" aria-hidden><i /></span>
      <p className="drop-loading-sub">One moment</p>
    </section>}

    {board && <>
      <div className="drop-card-surface">
        {/* The week leads. Overnight is the sharper look inside it, not a
            rival feature with its own page. */}
        <form className="hot-search" onSubmit={search}>
          <input type="search" value={term} onChange={e => setTerm(e.target.value)}
            placeholder="Look up a keyword" aria-label="Look up a keyword" />
          <button type="submit" disabled={!term.trim() || looking}>
            {looking ? "Searching" : "Search"}</button>
          {hits !== null && <button type="button" className="hot-search-clear"
            onClick={() => { ++searchRequest.current;setLooking(false);setHits(null); setNote(""); setTerm(""); }}>Clear</button>}
        </form>

        {note && <p className="hot-note" role="status">{note}</p>}

        {hits && hits.length > 0 && <section className="hot-hits">
          <p className="mini-label">ACTIVITY IN THIS PERIOD FOR &ldquo;{searchedTerm}&rdquo;{product!=="all"?` · ${product}`:""}</p>
          <div className="drop-grid">
            {hits.map(hit => <figure key={hit.listingId} className="drop-card">
              <a href={hit.url} target="_blank" rel="noopener noreferrer" className="drop-shot">
                {hit.image
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={hit.image} alt={decodeEntities(hit.title)} />
                  : <span className="drop-noshot">No picture</span>}
              </a>
              <figcaption>
                <p className="drop-figures">

                  <span className="drop-unit">{(hit.savesGained??0)>0?`+${hit.savesGained} favorites`:"Stock decreased"}</span>
                </p>
                {hit.price !== null && <p className="drop-sub">{money(hit.price, hit.currency)}</p>}
                <a className="drop-title" href={hit.url} target="_blank" rel="noopener noreferrer">
                  {decodeEntities(hit.title)}</a>
              </figcaption>
            </figure>)}
          </div>
        </section>}

        {/* One period is not a choice, and a lone highlighted tab looks like
            a control that has broken rather than the only honest option. */}
        {/*
            DISABLED, NOT HIDDEN.

            An earlier version dropped a period from the row until there was
            enough history for it, which silently made the feature look
            smaller than it is — a seller cannot want what they cannot see.
            Showing it greyed with the day it arrives says the opposite: this
            is coming, and here is when.
        */}
        {hits === null && <><nav className="sold-windows" aria-label="Period">
          {VIEWS.map(v => {
            const ready = covered >= v.hours;
            const days = Math.max(1, Math.ceil((v.hours - covered) / 24));
            return <button key={v.key} type="button"
              className={view.key === v.key ? "active" : undefined}
              aria-current={view.key === v.key ? "true" : undefined}
              disabled={!ready}
              title={ready ? undefined : `Available in ${days} ${days === 1 ? "day" : "days"}`}
              onClick={() => ready && load(v)}>
              {v.tab}
              {!ready && <small> · in {days}d</small>}
            </button>;
          })}
        </nav>

        {!board.night
          ? <section className="drop-loading">
              <p className="drop-loading-title">Getting started</p>
              <span className="drop-loading-track" aria-hidden><i /></span>
              <p className="drop-loading-sub">No activity is available yet. Try again later.</p>
            </section>
          : board.listings.length === 0
            ? <section className="drop-loading">
                <p className="drop-loading-title">Nothing yet for this period</p>
                <p className="drop-loading-sub">Choose another period.</p>
              </section>
            : <>
              <div className="hot-made-to-order">
                <button type="button" aria-pressed={madeToOrder}
                  className={madeToOrder ? "active" : undefined}
                  onClick={() => load(view, !madeToOrder, rights)}>
                  {madeToOrder ? "Showing made to order" : "Show made to order"}
                </button>
                <button type="button" aria-pressed={rights}
                  className={rights ? "active" : undefined}
                  onClick={() => load(view, madeToOrder, !rights)}>
                  {rights ? "Including flagged brand names" : "Include flagged brand names"}
                </button>
                <small>{rights
                  ? "Listings flagged with brand or tour names are included."
                  : madeToOrder
                    ? "Personalized listings included."
                    : "Personalized listings and flagged brand names are hidden."}</small>
              </div>

              <nav className="drop-tabs" aria-label="Product types">
                <button type="button" className={product === "all" ? "active" : undefined}
                  aria-current={product === "all" ? "true" : undefined}
                  onClick={() => setProduct("all")}>Everything</button>
                {board.products.map(p =>
                  <button key={p.key} type="button" className={product === p.key ? "active" : undefined}
                    aria-current={product === p.key ? "true" : undefined}
                    onClick={() => setProduct(p.key)}>
                    {p.label}
                  </button>)}
              </nav>

              <section className="drop-grid">
                {shown.map(listing => <figure key={listing.listingId} className="drop-card">
                  <a href={listing.url} target="_blank" rel="noopener noreferrer" className="drop-shot">
                    {listing.image
                      /* Never deferred — a lazy image is a 0x0 box until it scrolls in. */
                      /* eslint-disable-next-line @next/next/no-img-element */
                      ? <img src={listing.image} alt={decodeEntities(listing.title)} />
                      : <span className="drop-noshot">No picture</span>}
                    {/* The strongest thing this board can say. */}
                    {listing.soldOut && <span className="drop-badge sold-out">Sold out</span>}
                  </a>
                  <figcaption>
                    <p className="drop-figures">
                      <span className="drop-unit">{listing.savesGained > 0 ? `+${listing.savesGained.toLocaleString()} favorites` : "Stock decreased"}</span>
                    </p>
                    {listing.price !== null &&
                      <p className="drop-sub">{money(listing.price, listing.currency)}</p>}
                    <a className="drop-title" href={listing.url} target="_blank" rel="noopener noreferrer">
                      {decodeEntities(listing.title)}</a>
                  </figcaption>
                </figure>)}

                {shown.length === 0 && <p className="drop-none">
                  No activity was recorded for {product} in this period.</p>}
              </section>
            </>}</>}
      </div>


    </>}
  </div></FactoryShell>;
}
