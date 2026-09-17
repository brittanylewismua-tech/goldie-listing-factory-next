"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

/**
 * MARKET WATCH.
 *
 * Two tabs, a daily update, and a list of saved watches. Opening one shows the
 * evidence behind it. Nothing here suggests what the member should do with
 * that evidence — that is the seller's job, and a product that guesses at it
 * would be guessing.
 */

type Listing = {
  listingId: number; title: string; imageUrl: string; etsyUrl: string;
  state: string; label: string; confirmedAt: number;
  reviewsOnThisListing: number; displayFresh: boolean;
};

type NicheView = {
  key: string; phrase: string; stale?: boolean;
  summary?: { meaningfulMomentum: boolean; moving: number; repeated: number;
    newSinceLastBrief: number; shops: number };
  window?: string | null;
  visualPatterns?: string[];
  listings?: Listing[];
  gathering?: string | null;
  candidates?: { watching: number; shops: number };
  lastCheckedAt?: number;
};

type WatchRow = { key: string; phrase: string; moving: number; repeated: number;
  shops: number; lastCheckedAt: number; stale: boolean };

/*
  THE SHAPE THE BRIEF ACTUALLY RETURNS.

  This declared `headline`, `support` and `listingId`; the route returns
  `pattern`, `evidence`, `window` and a `listing` object. Every field the card
  rendered was undefined, so Shop Watch showed rows reading "reviews · 30 days"
  with no pattern and no link — two shapes for one card, written months apart.
*/
type ShopPattern = {
  pattern?: string;
  /* Why the number matters. A card without this is a count. */
  because?: string;
  evidence?: string;
  window?: string;
  listing?: { id: number | null; url: string };
};

type ShopView = {
  shopId: number; shopName: string; etsy: string;
  gettingAttention: ShopPattern[]; whatBuyersLove: ShopPattern[];
  whatBuyersDislike: ShopPattern[]; whatChanged: ShopPattern[];
  lastRefreshed?: { label?: string } | string;
};

const ago = (seconds: number) => {
  if (!seconds) return "not yet confirmed";
  const gap = Math.max(0, Math.floor(Date.now() / 1000) - seconds);
  if (gap < 3_600) return `confirmed ${Math.max(1, Math.round(gap / 60))} min ago`;
  if (gap < 172_800) return `confirmed ${Math.round(gap / 3_600)} h ago`;
  return `confirmed ${Math.round(gap / 86_400)} days ago`;
};

/*
  THREE STATES, NOT TWO.

  Both loaders used to `return` on a failed response and swallow a thrown one,
  leaving the list at its initial `[]`. A member whose watches failed to load
  was told "Watch a niche and Market Watch starts collecting evidence" — the
  new-member invitation, shown to somebody with seven saved niches. And with
  no loading state, that same sentence flashed on every single page load
  before the data arrived.

  This is the third page in this product to ship that defect, so the states
  are modelled once here rather than described in prose again: nothing on
  screen claims a list is empty until a response actually said so.
*/
type Load<T> = { status: "loading" | "ready" | "failed"; data: T };

/*
  WHICH TAB IS IN THE URL.

  Shop Watch had no address of its own: every visit landed on Niche Watch, so
  a member who only follows shops re-clicked past the other tab every time,
  and a shop state could not be linked to at all — including from the state
  preview, where two shop fixtures rendered the niche tab and proved nothing.
*/
const tabFromUrl = (): "niches" | "shops" => {
  if (typeof window === "undefined") return "niches";
  return new URLSearchParams(window.location.search).get("tab") === "shops"
    ? "shops" : "niches";
};

export default function MarketWatchClient(
  { signedInEmail, startTab }: { signedInEmail: string; startTab?: "niches" | "shops" },
) {
  void signedInEmail;
  const [tab, setTab] = useState<"niches" | "shops">(startTab ?? tabFromUrl);
  const [update, setUpdate] = useState<Load<{ lines: string[]; message: string | null } | null>>(
    { status: "loading", data: null });
  const [watches, setWatches] = useState<Load<WatchRow[]>>({ status: "loading", data: [] });
  const [open, setOpen] = useState<NicheView | null>(null);
  const [shops, setShops] = useState<Load<ShopView[]>>({ status: "loading", data: [] });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState("");
  const [error, setError] = useState("");

  const loadNiches = useCallback(async (quiet = false) => {
    if (!quiet) setWatches(was => ({ ...was, status: "loading" }));
    try {
      const response = await fetch("/api/market-watch/niches");
      if (!response.ok) { setWatches(was => ({ status: "failed", data: was.data })); return; }
      const body = await response.json() as { watches: WatchRow[] };
      setWatches({ status: "ready", data: body.watches ?? [] });
    } catch { setWatches(was => ({ status: "failed", data: was.data })); }
  }, []);

  const loadShops = useCallback(async (quiet = false) => {
    if (!quiet) setShops(was => ({ ...was, status: "loading" }));
    try {
      const response = await fetch("/api/shop-watch/brief");
      if (!response.ok) { setShops(was => ({ status: "failed", data: was.data })); return; }
      const body = await response.json() as { shops: ShopView[] };
      setShops({ status: "ready", data: body.shops ?? [] });
    } catch { setShops(was => ({ status: "failed", data: was.data })); }
  }, []);

  const loadUpdate = useCallback(async () => {
    setUpdate(was => ({ ...was, status: "loading" }));
    try {
      const response = await fetch("/api/market-watch/update");
      if (!response.ok) { setUpdate(was => ({ status: "failed", data: was.data })); return; }
      setUpdate({ status: "ready", data: await response.json() as
        { lines: string[]; message: string | null } });
    } catch { setUpdate(was => ({ status: "failed", data: was.data })); }
  }, []);

  useEffect(() => {
    void loadNiches();
    void loadShops();
    void loadUpdate();
  }, [loadNiches, loadShops, loadUpdate]);

  const add = async () => {
    const value = input.trim();
    if (!value || busy) return;
    setBusy(true);
    setError("");
    try {
      const path = tab === "niches" ? "/api/market-watch/niches" : "/api/market-watch/shops";
      const payload = tab === "niches" ? { phrase: value } : { input: value };
      const response = await fetch(path, { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json() as { error?: string } & NicheView;
      if (!response.ok) setError(body.error ?? "That could not be saved.");
      else {
        setInput("");
        if (tab === "niches") { setOpen(body); void loadNiches(true); }
        else void loadShops(true);
      }
    } catch { setError("That could not be saved."); }
    finally { setBusy(false); }
  };

  /*
    Opening a watch reads evidence from the database and can take a moment.
    With no state for it, the row absorbed the tap and the page sat still —
    so the member tapped again, and again.
  */
  /* One place changes the tab, so the address and the stale error from the
     other tab cannot drift apart from it. */
  const chooseTab = (next: "niches" | "shops") => {
    setTab(next);
    setError("");
    if (typeof window === "undefined" || startTab) return;
    const url = new URL(window.location.href);
    if (next === "shops") url.searchParams.set("tab", "shops");
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url.toString());
  };

  const openNiche = async (key: string) => {
    setError("");
    setOpening(key);
    try {
      const response = await fetch(`/api/market-watch/niches?key=${encodeURIComponent(key)}`);
      const body = await response.json() as NicheView & { error?: string };
      if (!response.ok) setError(body.error ?? "That watch could not be opened.");
      else setOpen(body);
    } catch { setError("That watch could not be opened."); }
    finally { setOpening(""); }
  };

  if (open) return <NicheDetail view={open} onBack={() => { setOpen(null); void loadNiches(true); }} />;

  return (
    <main className="mw">
      <h1>Market Watch</h1>
      <p className="lede">What is actually moving in the niches and shops you follow.</p>

      <section className="update">
        <h2>Today</h2>
        {update.status === "loading" && (
          <div className="update-wait" aria-hidden="true">
            <span className="p-skeleton" /><span className="p-skeleton" />
          </div>
        )}
        {update.status === "failed" && (
          <p className="update-failed">
            Today&apos;s update could not be loaded. Nothing has changed in what is being
            watched.{" "}
            <button type="button" className="p-button p-button-quiet" onClick={() => void loadUpdate()}>
              Try again
            </button>
          </p>
        )}
        {update.status === "ready" && (
          (update.data?.lines ?? []).length > 0
            ? <ul>{update.data!.lines.map(line => <li key={line}>{line}</li>)}</ul>
            /* `message` can be null. Rendering it bare left an empty paragraph
               under a "Today" heading — a section that looked broken rather
               than quiet. */
            : <p>{update.data?.message
                || "Nothing confirmed since your last visit. This fills in as evidence arrives."}</p>
        )}
      </section>

      <div className="tabs p-tabs" role="tablist">
        <button className="p-tab" role="tab" aria-selected={tab === "niches"} onClick={() => chooseTab("niches")}>
          Niche Watch
        </button>
        <button className="p-tab" role="tab" aria-selected={tab === "shops"} onClick={() => chooseTab("shops")}>
          Shop Watch
        </button>
      </div>

      <div className="add">
        <input className="p-input" type="text" value={input} onChange={event => setInput(event.target.value)}
          aria-label={tab === "niches" ? "Niche to watch" : "Shop to watch"}
          placeholder={tab === "niches" ? "bachelorette, dog mom…" : "Etsy shop link or name"} />
        <button className="p-button p-button-primary" onClick={() => void add()} disabled={busy || !input.trim()}>
          {busy ? "Saving…" : "Watch"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {tab === "niches" ? (
        <WatchList
          load={watches}
          onRetry={() => void loadNiches()}
          failure="Your saved niches could not be loaded. They have not been changed."
          empty="Watch a niche and Market Watch starts collecting evidence for it. Come back
                 tomorrow to see what changed."
        >
          {watches.data.map(watch => (
            <button key={watch.key} className="watch" data-stale={watch.stale ? "yes" : "no"}
              onClick={() => void openNiche(watch.key)}
              disabled={opening !== ""} aria-busy={opening === watch.key}>
              <span className="name">{watch.phrase}</span>
              <span className="meta">
                {opening === watch.key
                  ? "Opening…"
                  : watch.stale
                    ? "Last update could not be refreshed — showing the last confirmed reading"
                    /* D1674 · "feminist · 1 moving · 1 repeated · 1 shops" on
                       the live page. The counts are genuinely often one. */
                    : `${watch.moving} moving · ${watch.repeated} repeated · `
                      + `${watch.shops} ${watch.shops === 1 ? "shop" : "shops"}`}
              </span>
            </button>
          ))}
        </WatchList>
      ) : (
        <WatchList
          load={shops}
          onRetry={() => void loadShops()}
          failure="The shop brief could not be loaded. The shops you follow have not been changed."
          empty="Add a shop to follow what its buyers are saying."
        >
          {shops.data.map(shop => <ShopCard key={shop.shopId} shop={shop} />)}
        </WatchList>
      )}
    </main>
  );
}

/*
  ONE PLACE THAT DECIDES BETWEEN WAITING, BROKEN AND GENUINELY EMPTY.

  Both tabs render the same three states, and writing them twice is how the
  two drifted apart everywhere else in this product.
*/
function WatchList({ load, onRetry, failure, empty, children }: {
  load: { status: "loading" | "ready" | "failed"; data: unknown[] };
  onRetry: () => void; failure: string; empty: string; children: ReactNode;
}) {
  if (load.status === "loading" && load.data.length === 0) return (
    <div className="watch-wait" aria-label="Loading">
      <span className="p-skeleton" /><span className="p-skeleton" /><span className="p-skeleton" />
    </div>
  );
  if (load.status === "failed" && load.data.length === 0) return (
    <p className="p-notice failed">
      {failure}{" "}
      <button type="button" className="p-button p-button-quiet" onClick={onRetry}>Try again</button>
    </p>
  );
  return (
    <>
      {/* A refresh that failed while something is already on screen must not
          blank it. The stale list stays, labelled. */}
      {load.status === "failed" && (
        <p className="p-notice failed">
          {failure} Showing what was loaded before.{" "}
          <button type="button" className="p-button p-button-quiet" onClick={onRetry}>Try again</button>
        </p>
      )}
      {load.data.length === 0 ? <p className="empty">{empty}</p> : children}
    </>
  );
}

function NicheDetail({ view, onBack }: { view: NicheView; onBack: () => void }) {
  const listings = view.listings ?? [];
  const summary = view.summary;
  return (
    <main className="mw">
      <button className="back p-button p-button-quiet" onClick={onBack}>← All watches</button>
      <h1>{view.phrase}</h1>

      {view.stale && (
        <p className="stale-flag">
          Today&apos;s update could not be built. This is the last confirmed reading.
        </p>
      )}

      {summary && (
        <p className="summary">
          {summary.meaningfulMomentum
            /* Same rule as the list row: these counts are often one. */
            ? `${summary.moving} ${summary.moving === 1 ? "listing" : "listings"} moving · `
              + `${summary.repeated} with repeated momentum · `
              + `${summary.shops} ${summary.shops === 1 ? "shop" : "shops"}`
            /*
              D1675 · THE PAGE DENIED THE EVIDENCE IT WAS SHOWING.

              "Not enough verified evidence in this niche yet" sat directly
              above listings labelled "Repeated momentum" and "Momentum
              detected". Seen on the live page for girl power, which has
              confirmations but has not reached the bar.

              `meaningfulMomentum` is a threshold on listings, shops and
              repeat movement — deliberately the same bar Design Scanner
              uses, so the two features cannot disagree about a niche. That
              bar is not changed here. Only the sentence is, so it stops
              contradicting what is underneath it.
            */
            : listings.length
              ? `${listings.length} ${listings.length === 1 ? "listing" : "listings"} `
                + `confirmed, but not yet enough across enough shops to read as a `
                + `pattern. Each one below is a confirmed movement on its own.`
              : "Not enough verified evidence in this niche yet."}
          {view.window ? ` · ${view.window}` : ""}
          {summary.newSinceLastBrief > 0
            ? ` · ${summary.newSinceLastBrief} new since you last looked` : ""}
        </p>
      )}

      {view.gathering && listings.length === 0 && (
        <p className="empty">
          {view.gathering}
          {view.candidates?.watching
            ? ` Market Watch is watching ${view.candidates.watching} listings across `
              + `${view.candidates.shops} shops for this niche.`
            : ""}
        </p>
      )}

      {!view.gathering && !summary?.meaningfulMomentum && listings.length === 0 && (
        <p className="empty">
          Market Watch has not confirmed enough movement in this niche yet. It keeps
          watching, and this fills in as evidence arrives.
        </p>
      )}

      {(view.visualPatterns ?? []).length > 0 && (
        <section className="patterns">
          <h2>What the moving listings have in common</h2>
          <ul>{view.visualPatterns!.map(line => <li key={line}>{line}</li>)}</ul>
        </section>
      )}

      <div className="cards">
        {listings.map(listing => (
          <article className="card" key={listing.listingId}>
            {listing.imageUrl && listing.displayFresh
              /* Explicit dimensions, not just an aspect-ratio box: a lazy
                 image with no intrinsic size collapses the card to 0x0 until
                 it loads, which is a defect this codebase has shipped before
                 and now guards against. */
              ? <img src={listing.imageUrl} alt="" loading="lazy" width={570} height={570} />
              : (
                /* Etsy requires displayed listing data to be under six hours
                   old. An empty grey square looks like a bug; saying why looks
                   like a product that knows what it is doing. */
                <p className="no-image">
                  {listing.imageUrl
                    ? "Picture not current — refreshed shortly"
                    : "No picture available"}
                </p>
              )}
            <div className="body">
              <span className="tag" data-state={listing.state}>{listing.label}</span>
              <p className="title">{listing.title}</p>
              <span className="when">{ago(listing.confirmedAt)}</span>
              {listing.reviewsOnThisListing > 0 && (
                <span className="when">
                  {listing.reviewsOnThisListing} review
                  {listing.reviewsOnThisListing === 1 ? "" : "s"} on this listing
                </span>
              )}
            </div>
            <a href={listing.etsyUrl} target="_blank" rel="noreferrer noopener">
              View on Etsy
            </a>
          </article>
        ))}
      </div>
    </main>
  );
}

function ShopCard({ shop }: { shop: ShopView }) {
  const sections: Array<[string, ShopPattern[]]> = [
    ["Getting attention", shop.gettingAttention ?? []],
    ["What buyers love", shop.whatBuyersLove ?? []],
    ["What buyers dislike", shop.whatBuyersDislike ?? []],
    ["What changed", shop.whatChanged ?? []],
  ];
  const anything = sections.some(([, cards]) => cards.length > 0);
  return (
    <section className="shop">
      <h2 className="shop-name">{shop.shopName}</h2>
      {!anything && (
        <p className="empty">
          Nothing confirmed for this shop yet. Shop Watch checks it daily.
        </p>
      )}
      {sections.map(([name, cards]) => cards.length === 0 ? null : (
        <div key={name} className="section">
          <h3 className="section-name">{name}</h3>
          {/*
            D1674 · SAID ONCE, NOT ON EVERY CARD.

            Every attention card carried this warning in full, so three cards
            in a row repeated the same forty words verbatim. It is true of
            review evidence generally rather than of any one listing, so it
            belongs to the section — read once, and still read before any of
            the findings under it.
          */}
          {name === "Getting attention" && (
            <p className="section-caveat">
              Reviews are not sales, and a buyer can leave one up to a hundred days
              after delivery.
            </p>
          )}
          {cards.map((card, index) => (
            <div className="pattern" key={`${name}-${index}`}>
              <p className="pattern-headline">{card.pattern}</p>
              {/* The finding first, then why it is a finding. A card that
                  shows only the count is the one this replaced. */}
              {card.because && <p className="pattern-because">{card.because}</p>}
              <span className="support">
                {card.evidence}
                {card.window ? ` · ${card.window}` : ""}
              </span>
              {card.listing?.url && (
                <a href={card.listing.url} target="_blank" rel="noreferrer noopener">
                  {card.listing.id ? "View listing on Etsy" : "View shop on Etsy"}
                </a>
              )}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
