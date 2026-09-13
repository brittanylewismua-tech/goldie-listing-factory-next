"use client";

import { useEffect, useState } from "react";
import FactoryShell from "../factory-shell";

/**
 * THE HOT LIST.
 *
 * One question — what is actually selling on Etsy — asked over two lengths of
 * time. The week is what you plan against, because seven days is long enough
 * that one good afternoon cannot fake it. Overnight is what you open the tab
 * for, because it is the only view that catches something the moment it starts
 * moving.
 *
 * These were two separate pages sitting next to each other in the sidebar with
 * the same cards and the same rail. One of them ranked by saves over age and
 * could not see a sale at all. Now there is one board and a switch, and every
 * number on it is a count of things that left a shelf.
 *
 * Nothing here narrates how it is produced, and nothing claims a rank it
 * cannot support. It says what sold, and over what period.
 */

type Listing = {
  listingId: number; title: string; url: string; image: string | null;
  price: number | null; currency: string;
  sold: number; soldOut: boolean; product: string;
};
type Hit = { listingId: number; title: string; url: string; image: string | null;
  price: number | null; currency: string; sold: number; product: string };
type Board = {
  night: string | null; totalSold: number; hoursBack: number; coveredHours: number;
  building: boolean; unlocked: boolean; held: number; toUnlock: number;
  products: { key: string; label: string; sold: number; listings: number }[];
  listings: Listing[];
};

const VIEWS = [
  { key: "week", hours: 168, tab: "This week" },
  { key: "overnight", hours: 24, tab: "Overnight" },
];

/**
 * SAY THE PERIOD THERE IS DATA FOR, NOT THE ONE THAT WAS ASKED FOR.
 *
 * The board offered "This week" from its first day and put "sold this week"
 * under every number, which claimed six days nobody was watching. The counting
 * has a start date; until the window is older than that, the label is however
 * long we have actually been counting.
 */
function periodLabel(coveredHours: number, hoursBack: number) {
  const hours = Math.min(coveredHours || hoursBack, hoursBack);
  if (hours >= 144) return "sold this week";
  if (hours >= 20) {
    const days = Math.round(hours / 24);
    return days <= 1 ? "sold in 24 hours" : `sold in ${days} days`;
  }
  return hours === 1 ? "sold in the last hour" : `sold in ${hours} hours`;
}

const money = (value: number | null, currency: string) =>
  value === null ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);

export default function HotListPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [product, setProduct] = useState("all");
  const [view, setView] = useState(VIEWS[0]);
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [looking, setLooking] = useState(false);
  const [note, setNote] = useState("");

  const load = (next = view) => {
    setBoard(null); setError(""); setView(next);
    /* no-store: an open tab must not reuse a board from before a repair. */
    fetch(`/api/sold-overnight?hours=${next.hours}`, { cache: "no-store" })
      .then(async response => {
        const result = await response.json() as Board & { error?: string };
        if (!response.ok) throw new Error(result.error || "This could not be loaded.");
        setBoard(result);
        setProduct("all");
      })
      .catch(e => setError(e instanceof Error ? e.message : "This could not be loaded."));
  };
  useEffect(() => { load(VIEWS[0]); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  /*
    LOOK A PHRASE UP AGAINST WHAT SOLD.

    Not gated. The unlock ladder is parked until the rest of the product is
    settled, but this is a tool rather than a reward and there is no reason a
    seller should have to earn the right to ask a question.
  */
  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!term.trim() || looking) return;
    setLooking(true); setNote(""); setHits(null);
    try {
      const response = await fetch(
        `/api/sold-overnight/search?keyword=${encodeURIComponent(term.trim())}`, { cache: "no-store" });
      const result = await response.json() as { listings?: Hit[]; error?: string };
      if (!response.ok) throw new Error(result.error || "That could not be looked up.");
      setHits(result.listings ?? []);
      if (!result.listings?.length)
        setNote(`Nothing matching \u201c${term.trim()}\u201d has sold in the last week.`);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "That could not be looked up.");
    } finally { setLooking(false); }
  }

  const shown = board
    ? product === "all" ? board.listings : board.listings.filter(l => l.product === product)
    : [];

  /* Not "home": the Hot List is reached FROM home and is not it, and lighting
     Home while standing here says the rail cannot tell where you are. No rail
     item matches "hotlist", so nothing is lit. */
  return <FactoryShell active="hotlist" title="Hot List"><div className="drop-page sold-page interior-page">
    <header className="drop-head">
      <p className="mini-label">HOT LIST</p>
      <h1>What&apos;s actually selling</h1>
      <p>Real sales on Etsy, not rankings or saves.</p>
    </header>

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
        {/* The week leads. Overnight is the sharper look inside it, not a
            rival feature with its own page. */}
        <form className="hot-search" onSubmit={search}>
          <input type="search" value={term} onChange={e => setTerm(e.target.value)}
            placeholder="Look up a keyword" aria-label="Look up a keyword" />
          <button type="submit" disabled={!term.trim() || looking}>
            {looking ? "Searching" : "Search"}</button>
          {hits !== null && <button type="button" className="hot-search-clear"
            onClick={() => { setHits(null); setNote(""); setTerm(""); }}>Clear</button>}
        </form>

        {note && <p className="hot-note" role="status">{note}</p>}

        {hits && hits.length > 0 && <section className="hot-hits">
          <p className="mini-label">SOLD IN THE LAST WEEK FOR &ldquo;{term.trim()}&rdquo;</p>
          <div className="drop-grid">
            {hits.map(hit => <figure key={hit.listingId} className="drop-card">
              <a href={hit.url} target="_blank" rel="noopener noreferrer" className="drop-shot">
                {hit.image
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={hit.image} alt={hit.title} />
                  : <span className="drop-noshot">No picture</span>}
              </a>
              <figcaption>
                <p className="drop-figures">
                  <span className="drop-numeral">{hit.sold.toLocaleString()}</span>
                  <span className="drop-unit">{periodLabel(board?.coveredHours ?? 168, 168)}</span>
                </p>
                {hit.price !== null && <p className="drop-sub">{money(hit.price, hit.currency)}</p>}
                <a className="drop-title" href={hit.url} target="_blank" rel="noopener noreferrer">
                  {hit.title}</a>
              </figcaption>
            </figure>)}
          </div>
        </section>}

        <nav className="sold-windows" aria-label="Period">
          {VIEWS.map(v =>
            <button key={v.key} type="button"
              className={view.key === v.key ? "active" : undefined}
              aria-current={view.key === v.key ? "true" : undefined}
              onClick={() => load(v)}>{v.tab}</button>)}
        </nav>

        {!board.night
          ? <section className="drop-loading">
              <p className="drop-loading-title">Getting started</p>
              <span className="drop-loading-track" aria-hidden><i /></span>
              <p className="drop-loading-sub">The first sales will appear here shortly.</p>
            </section>
          : board.listings.length === 0
            ? <section className="drop-loading">
                <p className="drop-loading-title">Nothing yet for this period</p>
                <p className="drop-loading-sub">Try the other one.</p>
              </section>
            : <>
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
                    {/* The strongest thing this board can say. */}
                    {listing.soldOut && <span className="drop-badge sold-out">Sold out</span>}
                  </a>
                  <figcaption>
                    <p className="drop-figures">
                      <span className="drop-numeral">{listing.sold.toLocaleString()}</span>
                      <span className="drop-unit">{periodLabel(board.coveredHours, view.hours)}</span>
                    </p>
                    {listing.price !== null &&
                      <p className="drop-sub">{money(listing.price, listing.currency)}</p>}
                    <a className="drop-title" href={listing.url} target="_blank" rel="noopener noreferrer">
                      {listing.title}</a>
                  </figcaption>
                </figure>)}

                {shown.length === 0 && <p className="drop-none">
                  Nothing in {product} sold in this period.</p>}
              </section>
            </>}
      </div>

      <details className="drop-note">
        <summary>What these numbers mean</summary>
        <p>
          These are counted from the drop in how many of each item are available to
          buy, over the period you have chosen, and only for as long as we have been
          counting. Not a ranking,
          not an estimate, and not a guess from search position. Digital downloads are
          left out, since they have nothing to do with printing, and so is a shop
          rearranging its own listings rather than selling any. What is left is sales,
          and only sales.
        </p>
      </details>
    </>}
  </div></FactoryShell>;
}
