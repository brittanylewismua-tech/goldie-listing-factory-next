"use client";

import { useCallback, useEffect, useState } from "react";

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

type ShopPattern = { headline?: string; support?: number; listingId?: number | null;
  window?: string; etsyUrl?: string };

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

export default function MarketWatchClient({ signedInEmail }: { signedInEmail: string }) {
  void signedInEmail;
  const [tab, setTab] = useState<"niches" | "shops">("niches");
  const [update, setUpdate] = useState<{ lines: string[]; message: string | null } | null>(null);
  const [watches, setWatches] = useState<WatchRow[]>([]);
  const [open, setOpen] = useState<NicheView | null>(null);
  const [shops, setShops] = useState<ShopView[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadNiches = useCallback(async () => {
    try {
      const response = await fetch("/api/market-watch/niches");
      if (!response.ok) return;
      const body = await response.json() as { watches: WatchRow[] };
      setWatches(body.watches ?? []);
    } catch { /* the saved list is a convenience */ }
  }, []);

  const loadShops = useCallback(async () => {
    try {
      const response = await fetch("/api/shop-watch/brief");
      if (!response.ok) return;
      const body = await response.json() as { shops: ShopView[] };
      setShops(body.shops ?? []);
    } catch { /* same */ }
  }, []);

  useEffect(() => {
    void loadNiches();
    void loadShops();
    (async () => {
      try {
        const response = await fetch("/api/market-watch/update");
        if (response.ok) setUpdate(await response.json() as
          { lines: string[]; message: string | null });
      } catch { /* the update is not load-bearing */ }
    })();
  }, [loadNiches, loadShops]);

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
        if (tab === "niches") { setOpen(body); void loadNiches(); }
        else void loadShops();
      }
    } catch { setError("That could not be saved."); }
    finally { setBusy(false); }
  };

  const openNiche = async (key: string) => {
    setError("");
    try {
      const response = await fetch(`/api/market-watch/niches?key=${encodeURIComponent(key)}`);
      const body = await response.json() as NicheView & { error?: string };
      if (!response.ok) setError(body.error ?? "That watch could not be opened.");
      else setOpen(body);
    } catch { setError("That watch could not be opened."); }
  };

  if (open) return <NicheDetail view={open} onBack={() => { setOpen(null); void loadNiches(); }} />;

  return (
    <main className="mw">
      <h1>Market Watch</h1>
      <p className="lede">What is actually moving in the niches and shops you follow.</p>

      {update && (
        <section className="update">
          <h2>Today</h2>
          {update.lines.length > 0
            ? <ul>{update.lines.map(line => <li key={line}>{line}</li>)}</ul>
            : <p>{update.message}</p>}
        </section>
      )}

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "niches"} onClick={() => setTab("niches")}>
          Niche Watch
        </button>
        <button role="tab" aria-selected={tab === "shops"} onClick={() => setTab("shops")}>
          Shop Watch
        </button>
      </div>

      <div className="add">
        <input type="text" value={input} onChange={event => setInput(event.target.value)}
          aria-label={tab === "niches" ? "Niche to watch" : "Shop to watch"}
          placeholder={tab === "niches" ? "bachelorette, dog mom…" : "Etsy shop link or name"} />
        <button onClick={() => void add()} disabled={busy || !input.trim()}>
          {busy ? "Saving…" : "Watch"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {tab === "niches" ? (
        watches.length === 0
          ? <p className="empty">
              Watch a niche and Goldie starts collecting evidence for it. Come back
              tomorrow to see what changed.
            </p>
          : watches.map(watch => (
              <button key={watch.key} className="watch" data-stale={watch.stale ? "yes" : "no"}
                onClick={() => void openNiche(watch.key)}>
                <span className="name">{watch.phrase}</span>
                <span className="meta">
                  {watch.stale
                    ? "Last update could not be refreshed — showing the last confirmed reading"
                    : `${watch.moving} moving · ${watch.repeated} repeated · ${watch.shops} shops`}
                </span>
              </button>
            ))
      ) : (
        shops.length === 0
          ? <p className="empty">Add a shop to follow what its buyers are saying.</p>
          : shops.map(shop => <ShopCard key={shop.shopId} shop={shop} />)
      )}
    </main>
  );
}

function NicheDetail({ view, onBack }: { view: NicheView; onBack: () => void }) {
  const listings = view.listings ?? [];
  const summary = view.summary;
  return (
    <main className="mw">
      <button className="back" onClick={onBack}>← All watches</button>
      <h1>{view.phrase}</h1>

      {view.stale && (
        <p className="stale-flag">
          Today&apos;s update could not be built. This is the last confirmed reading.
        </p>
      )}

      {summary && (
        <p className="summary">
          {summary.meaningfulMomentum
            ? `${summary.moving} listings moving · ${summary.repeated} with repeated momentum · `
              + `${summary.shops} shops`
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
            ? ` Goldie is watching ${view.candidates.watching} listings across `
              + `${view.candidates.shops} shops for this niche.`
            : ""}
        </p>
      )}

      {!view.gathering && !summary?.meaningfulMomentum && listings.length === 0 && (
        <p className="empty">
          Goldie has not confirmed enough movement in this niche yet. It keeps
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
              : <div style={{ aspectRatio: "1 / 1", background: "#f4f2ef" }} />}
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
    <section className="section">
      <h3>{shop.shopName}</h3>
      {!anything && (
        <p className="empty">
          Nothing confirmed for this shop yet. Goldie checks it daily.
        </p>
      )}
      {sections.map(([name, cards]) => cards.length === 0 ? null : (
        <div key={name} className="section">
          <h3>{name}</h3>
          {cards.map((card, index) => (
            <div className="pattern" key={`${name}-${index}`}>
              <p>{card.headline}</p>
              <span className="support">
                {card.support} review{card.support === 1 ? "" : "s"}
                {card.window ? ` · ${card.window}` : ""}
              </span>
              {card.listingId && (
                <a href={`https://www.etsy.com/listing/${card.listingId}`}
                  target="_blank" rel="noreferrer noopener">View listing on Etsy</a>
              )}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
