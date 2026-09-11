"use client";

import { useEffect, useState } from "react";
import FactoryShell from "../factory-shell";

/**
 * TODAY'S DROP.
 *
 * What moved in print-on-demand overnight, so there is a reason to open this
 * on a morning nobody feels like listing. Everything on the page is a counted
 * number — Etsy's own position, saves, age — and the one derived figure, saves
 * per day, is division on two of those. Nothing here says "best seller",
 * because Etsy publishes no sales and inferring them would be a guess wearing
 * the clothes of a fact.
 */

type Listing = {
  listingId: number; title: string; url: string; image: string | null;
  price: number | null; currency: string; favorites: number;
  ageDays: number; savesPerDay: number; rank: number;
};
type Category = {
  taxonomyId: number; label: string; listings: Listing[]; heat: number;
  newToday: number[]; climbing: number[]; held: number;
};
type Drop = {
  day: string; fresh: boolean; building: boolean; unlocked: boolean;
  lockedCount: number;
  streak: { count: number; target: number; message: string; hit: boolean };
  categories: Category[];
};

const money = (value: number | null, currency: string) =>
  value === null ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);

export default function DropPage() {
  const [drop, setDrop] = useState<Drop | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/drop").then(async response => {
      const result = await response.json() as Drop & { error?: string };
      if (!response.ok) throw new Error(result.error || "Today's drop could not be loaded.");
      setDrop(result);
      setOpen(result.categories[0]?.taxonomyId ?? null);
    }).catch(e => setError(e instanceof Error ? e.message : "Today's drop could not be loaded."));
  }, []);

  return <FactoryShell active="drop" title="Today's Drop"><div className="drop-page interior-page">
    <header>
      <p className="mini-label">TODAY&apos;S DROP</p>
      <h1>What moved overnight</h1>
      <p>Etsy&apos;s own top listings across the print-on-demand shelf, read fresh each morning. Positions, saves and age are Etsy&apos;s numbers — nobody publishes sales, so nothing here claims them.</p>
    </header>

    {error && <section className="drop-error" role="alert"><h2>Not today</h2><p>{error}</p></section>}
    {!drop && !error && <p>Reading the shelf…</p>}

    {drop && <>
      <section className="drop-streak">
        <p className="streak-message">{drop.streak.message}</p>
        {!drop.unlocked && <p className="streak-reward">
          {/* The lock is stated as what opens, never as what is being withheld. */}
          {drop.lockedCount === 1
            ? "One more listing day opens every category in full."
            : `${drop.lockedCount} more listing days open every category in full.`}
        </p>}
      </section>

      {!drop.fresh && <p className="drop-stale">
        {/* Said out loud. A drop dated yesterday reads as a bug unless the page
            owns it, and it is usually just an early morning. */}
        Showing {new Date(`${drop.day}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} — today&apos;s is still being read.
      </p>}

      {drop.categories.length === 0
        ? <p>The first read is still running. This fills in within a few minutes.</p>
        : <>
          <nav className="drop-tabs" aria-label="Product categories">
            {drop.categories.map(category =>
              <button key={category.taxonomyId} type="button"
                className={open === category.taxonomyId ? "active" : undefined}
                aria-current={open === category.taxonomyId ? "true" : undefined}
                onClick={() => setOpen(category.taxonomyId)}>
                {category.label}
                {/* Heat is the median saves-per-day of the shelf: which product
                    type is moving fastest, not which has the biggest numbers. */}
                {category.heat > 0 && <small> {category.heat}/day</small>}
              </button>)}
          </nav>

          {drop.categories.filter(category => category.taxonomyId === open).map(category =>
            <section key={category.taxonomyId} className="drop-grid">
              {category.listings.map(listing => {
                const isNew = category.newToday.includes(listing.listingId);
                const climbing = category.climbing.includes(listing.listingId);
                return <article key={listing.listingId} className="drop-card">
                  <a href={listing.url} target="_blank" rel="noopener noreferrer">
                    {listing.image
                      /* eslint-disable-next-line @next/next/no-img-element */
                      /* Never deferred — D832: a deferred image is an
                         empty 0x0 box until it scrolls into view. The card
                         reserves the space in CSS instead. */
                      ? <img src={listing.image} alt="" />
                      : <span className="drop-noimage" aria-hidden />}
                  </a>
                  <div className="drop-meta">
                    <span className="drop-rank">#{listing.rank}</span>
                    {isNew && <span className="drop-tag new">New today</span>}
                    {climbing && !isNew && <span className="drop-tag up">Climbing</span>}
                  </div>
                  <a className="drop-title" href={listing.url} target="_blank" rel="noopener noreferrer">{listing.title}</a>
                  <p className="drop-numbers">
                    {money(listing.price, listing.currency)}
                    {listing.favorites > 0 && <> · {listing.favorites.toLocaleString()} saves</>}
                    {/* Suppressed under a week old: a tiny denominator makes a
                        new listing look like the hottest thing on the shelf. */}
                    {listing.savesPerDay > 0 && <> · {listing.savesPerDay}/day</>}
                  </p>
                </article>;
              })}
              {category.held > 0 && <article className="drop-card locked">
                <p><strong>{category.held} more</strong></p>
                <p>Five listing days in any seven opens the whole category.</p>
              </article>}
            </section>)}
        </>}

      <p className="drop-note">
        Positions are Etsy&apos;s own ranking, which weighs how well a listing matches the search as well as how it performs — and new listings get a deliberate visibility boost. A high position is not proof of sales. Some of what appears here is handmade rather than printed; the categories do not separate them.
      </p>
    </>}
  </div></FactoryShell>;
}
