"use client";

import { useEffect, useState } from "react";
import FactoryShell from "../factory-shell";
import UnlockCards from "../unlock-cards";

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
    /* no-store: an open tab must not reuse a board from before a repair. */
    fetch(`/api/sold-overnight?hours=${window}`, { cache: "no-store" })
      .then(async response => {
        const result = await response.json() as Board & { error?: string };
        if (!response.ok) throw new Error(result.error || "This could not be loaded.");
        setBoard(result);
        setProduct("all");
      })
      .catch(e => setError(e instanceof Error ? e.message : "This could not be loaded."));
  };
  useEffect(() => { load(24); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const shown = board
    ? product === "all" ? board.listings : board.listings.filter(l => l.product === product)
    : [];

  return <FactoryShell active="sold" title="Sold Overnight"><div className="drop-page sold-page interior-page">
    <header className="drop-head">
      <p className="mini-label">SOLD OVERNIGHT</p>
      <h1>What actually sold</h1>
      <p>Real sales on Etsy, not rankings or saves. Updated through the day.</p>
    </header>

    {/* A failure says so and offers a way out. A spinner that never resolves
        teaches somebody the page is broken and gives them nothing to do. */}
    {error && <section className="drop-error" role="alert">
      <h2>This could not be loaded</h2>
      <p>{error}</p>
      <button type="button" onClick={() => window.location.reload()}>Try again</button>
    </section>}

    {!board && !error && <section className="drop-loading">
      <p className="drop-loading-title">Finding what sold</p>
      <span className="drop-loading-track" aria-hidden><i /></span>
      <p className="drop-loading-sub">One moment</p>
    </section>}

    {board && <>
      <div className="drop-card-surface">
        {/* The window, not a date. There is no "yesterday's edition" to go
            back to — the count is continuous, so the only real choice is how
            far back to look. */}
        {/*
            NO HEADLINE TOTAL, AND NO SAMPLE SIZE.

            This said "6,824 items sold — across the 11,695 Etsy listings we
            watch". Both halves were a mistake. The aggregate is not a number
            anybody acts on, and naming the size of the corpus invites the
            reader to judge the feature by its sample rather than by what it
            found — it reads as a limit being confessed. The board is the
            answer; the window above it is all the framing it needs.
        */}
        {/* One rail, one board. Today's Hot List used to be a second page
            answering the same question with a weaker signal, sitting next to
            this one in the nav with the same cards and the same unlock rail.
            Its keyword lookup was the only thing it had that this does not,
            so that came along and the rest was retired. */}
        <UnlockCards
          controlLabel="Look back further"
          onlyMovers={hours > 24}
          onToggleMovers={on => load(on ? 168 : 24)}
        />

        <nav className="sold-windows" aria-label="Time window">
          {WINDOWS.map(w =>
            <button key={w.hours} type="button"
              className={hours === w.hours ? "active" : undefined}
              aria-current={hours === w.hours ? "true" : undefined}
              onClick={() => load(w.hours)}>{w.label}</button>)}
        </nav>

        {!board.night
          ? <section className="drop-loading">
              <p className="drop-loading-title">Getting started</p>
              <span className="drop-loading-track" aria-hidden><i /></span>
              <p className="drop-loading-sub">
                The first sales will appear here shortly.
              </p>
            </section>
          : board.listings.length === 0
            ? <section className="drop-loading">
                <p className="drop-loading-title">Nothing yet in this window</p>
                <p className="drop-loading-sub">Try a longer one.</p>
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
                    {/* PRICE ONLY. This used to print the listing's remaining
                        stock beside it — "171,447 left" — which is somebody
                        else's inventory, no use to a seller deciding what to
                        make, and a straight description of the plumbing. */}
                    {listing.price !== null &&
                      <p className="drop-sub">{money(listing.price, listing.currency)}</p>}
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
        <summary>What these numbers mean</summary>
        <p>
          These are real sales on Etsy over the window you have chosen — not a ranking,
          not an estimate, and not a guess from search position. Digital downloads are
          left out, since they have nothing to do with printing, and so is a shop
          rearranging its own listings rather than selling any. What is left is sales,
          and only sales.
        </p>
      </details>
    </>}
  </div></FactoryShell>;
}
