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
  night: string | null; watched: number; totalSold: number;
  building: boolean; sweeping: boolean; unlocked: boolean; held: number; toUnlock: number;
  viewing: string | null; back: string | null;
  products: { key: string; label: string; sold: number }[];
  listings: Listing[];
};

const money = (value: number | null, currency: string) =>
  value === null ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

export default function SoldOvernightPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [product, setProduct] = useState<string>("all");

  const load = (night?: string | null) => {
    setBoard(null); setError("");
    fetch(`/api/sold-overnight${night ? `?night=${night}` : ""}`, { cache: "no-store" })
      .then(async response => {
        const result = await response.json() as Board & { error?: string };
        if (!response.ok) throw new Error(result.error || "Last night's sales could not be loaded.");
        setBoard(result);
        setProduct("all");
      })
      .catch(e => setError(e instanceof Error ? e.message : "Last night's sales could not be loaded."));
  };
  useEffect(() => { load(); }, []);

  const shown = board
    ? product === "all" ? board.listings : board.listings.filter(l => l.product === product)
    : [];

  return <FactoryShell active="sold" title="Sold Overnight"><div className="drop-page sold-page interior-page">
    <header className="drop-head">
      <p className="mini-label">SOLD OVERNIGHT</p>
      <h1>What actually sold while you slept</h1>
      <p>Counted, not estimated. Every number is how far a listing&apos;s stock fell since last night.</p>
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
        <div className="drop-toolbar">
          {board.viewing
            ? <button type="button" className="drop-back" onClick={() => load()}>&larr; Back to last night</button>
            : board.back && <button type="button" className="drop-back" onClick={() => load(board.back)}>&larr; The night before</button>}
          {board.night && <span className="drop-viewing">{longDate(board.night)}</span>}
        </div>

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
            across the {board.watched.toLocaleString()} Etsy listings we watch
            {board.sweeping && <> &middot; still counting, this will rise</>}
          </p>
        </section>}

        {!board.night
          ? <section className="drop-loading">
              <p className="drop-loading-title">The first night is being counted</p>
              <span className="drop-loading-track" aria-hidden><i /></span>
              <p className="drop-loading-sub">
                Stock has to be read twice before anything can be said to have sold.
                The first full board lands after tonight.
              </p>
            </section>
          : board.listings.length === 0
            ? <section className="drop-loading">
                <p className="drop-loading-title">Nothing had moved yet when this was read</p>
                <p className="drop-loading-sub">Check back after the next overnight count.</p>
              </section>
            : <>
              {/* Etsy's own category for each listing, not a guess from the
                  title. Which blank to order is the decision this page is
                  actually for. */}
              <nav className="drop-tabs" aria-label="Product types">
                <button type="button" className={product === "all" ? "active" : undefined}
                  aria-current={product === "all" ? "true" : undefined}
                  onClick={() => setProduct("all")}>Everything</button>
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
          every listing we watch, once a night, and compare it to the night before. If
          it fell by four, four of them sold. Stock going up means the shop restocked,
          which is not a sale and is not counted. Nothing here is a ranking, an
          estimate, or a guess from search position.
        </p>
      </details>
    </>}
  </div></FactoryShell>;
}
