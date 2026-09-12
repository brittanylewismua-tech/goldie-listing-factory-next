"use client";

import { useEffect, useState } from "react";
import FactoryShell from "../factory-shell";

/**
 * SOLD OVERNIGHT.
 *
 * The only page in this app that can say the word "sold" and mean it. Every
 * number here is a subtraction between two readings of a listing's stock —
 * last night's and this morning's — so "sold 6" means six of them left the
 * shelf, counted, not modelled from ranking or saves.
 *
 * The page says exactly that and nothing more. No "bestseller", no "trending",
 * no score. Where the older board had to hedge every figure, this one can
 * simply state what happened, which is the whole reason it was worth building.
 */

type Listing = {
  listingId: number; title: string; url: string; image: string | null;
  price: number | null; currency: string;
  sold: number; soldOut: boolean; savesGained: number; left: number | null;
  product: string;
};
type Board = {
  night: string | null; watched: number; totalSold: number; hoursBack: number;
  building: boolean; unlocked: boolean; held: number; toUnlock: number;
  products: { key: string; label: string; sold: number; listings: number }[];
  listings: Listing[];
};

/** The windows worth offering. Anything else is a settings screen. */
const WINDOWS = [
  { hours: 24, label: "Last 24 hours" },
  { hours: 48, label: "Last 2 days" },
  { hours: 168, label: "Last 7 days" },
];

const money = (value: number | null, currency: string) =>
  value === null ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);



export default function SoldOvernightPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [product, setProduct] = useState<string>("all");
  const [hours, setHours] = useState(24);

  const load = (window = hours) => {
    setBoard(null); setError(""); setHours(window);
    fetch(`/api/sold-overnight?hours=${window}`, { cache: "no-store" })
      .then(async response => {
        const result = await response.json() as Board & { error?: string };
        if (!response.ok) throw new Error(result.error || "Last night's sales could not be loaded.");
        setBoard(result);
        setProduct("all");
      })
      .catch(e => setError(e instanceof Error ? e.message : "Last night's sales could not be loaded."));
  };
  useEffect(() => { load(24); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const shown = board
    ? product === "all" ? board.listings : board.listings.filter(l => l.product === product)
    : [];

  return <FactoryShell active="sold" title="Sold Overnight"><div className="drop-page sold-page interior-page">
    <header className="drop-head">
      <p className="mini-label">SOLD OVERNIGHT</p>
      <h1>What actually sold</h1>
      <p>Counted, not estimated. Every number is how far a listing&apos;s stock has fallen.</p>
    </header>

    {error && <section className="drop-error" role="alert">
      <h2>Last night&apos;s sales could not be loaded</h2><p>{error}</p></section>}

    {!board && !error && <section className="drop-loading">
      <p className="drop-loading-title">Counting what sold</p>
      <span className="drop-loading-track" aria-hidden><i /></span>
      <p className="drop-loading-sub">Comparing this morning&apos;s stock against last night&apos;s</p>
    </section>}

    {board && <>
      <div className="drop-card-surface">
        {/* The window, not a date. There is no "yesterday's edition" to go
            back to — the count is continuous, so the only real choice is how
            far back to look. */}
        <nav className="sold-windows" aria-label="Time window">
          {WINDOWS.map(w =>
            <button key={w.hours} type="button"
              className={hours === w.hours ? "active" : undefined}
              aria-current={hours === w.hours ? "true" : undefined}
              onClick={() => load(w.hours)}>{w.label}</button>)}
        </nav>

        {/* The headline figure. One number, stated plainly, with the size of
            the shelf it was counted across — because "1,284 sold" means
            nothing without knowing it was counted over forty thousand
            listings rather than picked from a handful. */}
        {board.night && <section className="sold-headline">
          <p className="sold-total">
            <span className="sold-total-numeral">{board.totalSold.toLocaleString()}</span>
            <span className="sold-total-unit">{board.totalSold === 1 ? "item sold" : "items sold"}</span>
          </p>
          <p className="sold-total-sub">
            {WINDOWS.find(w => w.hours === board.hoursBack)?.label.toLowerCase() ?? "recently"}
            {" "}&middot; across the {board.watched.toLocaleString()} Etsy listings we watch
            {board.building && <> &middot; counting now, this will rise</>}
          </p>
        </section>}

        {!board.night
          ? <section className="drop-loading">
              <p className="drop-loading-title">Counting has started</p>
              <span className="drop-loading-track" aria-hidden><i /></span>
              <p className="drop-loading-sub">
                Stock has to be read twice before anything can be said to have sold,
                and the second read is under way. Sales appear here as they happen.
              </p>
            </section>
          : board.listings.length === 0
            ? <section className="drop-loading">
                <p className="drop-loading-title">Nothing has moved in this window yet</p>
                <p className="drop-loading-sub">Try a longer one, or give the count a little more time.</p>
              </section>
            : <>
              {/* Etsy's own category for each listing, not a guess from the
                  title. Which blank to order is the decision this page is
                  actually for. */}
              <nav className="drop-tabs" aria-label="Product types">
                <button type="button" className={product === "all" ? "active" : undefined}
                  aria-current={product === "all" ? "true" : undefined}
                  onClick={() => setProduct("all")}>Everything</button>
                {/* Only shelves with real depth get a tab. A tab reading
                    "Throw Pillows 1" invites a click that leads to one card
                    and a dead end. Everything is still on the board under
                    Everything. */}
                {board.products.map(p =>
                  <button key={p.key} type="button" className={product === p.key ? "active" : undefined}
                    aria-current={product === p.key ? "true" : undefined}
                    onClick={() => setProduct(p.key)}>
                    {p.label}<small>{p.sold.toLocaleString()}</small>
                  </button>)}
              </nav>

              <section className="drop-grid">
                {shown.map(listing => <figure key={listing.listingId} className="drop-card">
                  <a href={listing.url} target="_blank" rel="noopener noreferrer" className="drop-shot">
                    {listing.image
                      /* Never deferred — a lazy image is a 0x0 box until it scrolls in. */
                      /* eslint-disable-next-line @next/next/no-img-element */
                      ? <img src={listing.image} alt={listing.title} />
                      : <span className="drop-noshot">No picture</span>}
                    {listing.soldOut && <span className="drop-badge sold-out">Sold out</span>}
                  </a>
                  <figcaption>
                    <p className="drop-figures">
                      <span className="drop-numeral">{listing.sold.toLocaleString()}</span>
                      <span className="drop-unit">sold</span>
                      {listing.savesGained > 0 &&
                        <span className="drop-rate">+{listing.savesGained.toLocaleString()} saves</span>}
                    </p>
                    <p className="drop-sub">
                      {listing.price !== null && money(listing.price, listing.currency)}
                      {listing.left !== null && <>
                        {listing.price !== null && " · "}
                        {listing.left === 0 ? "none left" : `${listing.left.toLocaleString()} left`}
                      </>}
                    </p>
                    <a className="drop-title" href={listing.url} target="_blank" rel="noopener noreferrer">
                      {listing.title}</a>
                  </figcaption>
                </figure>)}

                {shown.length === 0 && <p className="drop-none">
                  Nothing in {product} sold overnight.</p>}

                {/* The rest of the board, named as a number rather than a
                    locked padlock. What is behind it is more of the same
                    thing, which is the only reward worth offering. */}
                {board.held > 0 && <article className="drop-card locked">
                  <p className="drop-numeral">+{board.held}</p>
                  <p>more sold overnight. Create {board.toUnlock} more {board.toUnlock === 1 ? "listing" : "listings"} this week to see them all.</p>
                </article>}
              </section>
            </>}
      </div>

      <details className="drop-note">
        <summary>Where these numbers come from</summary>
        <p>
          Etsy publishes how many of an item are left to buy. We read that number for
          every listing we watch, every few hours, and compare it to the reading before.
          If it fell by four, four of them sold. Stock going up means the shop restocked,
          which is not a sale and is not counted. Digital downloads are left out, since
          they are nothing to do with printing. Nothing here is a ranking, an estimate,
          or a guess from search position.
        </p>
      </details>
    </>}
  </div></FactoryShell>;
}
