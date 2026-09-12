"use client";

import { useEffect, useState } from "react";

/**
 * FOUR THINGS, AND HOW FAR AWAY EACH ONE IS.
 *
 * The ladder and the controls used to be two separate ideas stacked on top of
 * each other — a list of names that looked pressable and did nothing, and
 * below it the actual controls. Turning the names into controls then deleted
 * the ladder, which took the progress with it: nothing said what was locked,
 * nothing said how far, and all that survived were two orphan sentences about
 * scoring on a page about Etsy listings.
 *
 * One row now. Each tier IS its control. An open one works; a locked one is
 * visibly disabled and carries the exact number of listings that opens it.
 * Nothing is hidden, because hiding a reward removes the reason to earn it,
 * and nothing pretends to be pressable when it is not.
 */

type Milestone = { key: string; name: string; unlocked: boolean; remaining: number; needsSets: number };
type State = { listings: number; sets: number; credits: number; milestones: Milestone[] };
type Found = { title: string; url: string; image: string | null; favorites: number };

/** "3 more listings" / "2 more sets" — the counter, said the same way everywhere. */
const togo = (m?: Milestone) =>
  !m ? "" : m.needsSets
    ? `${m.remaining} more set${m.remaining === 1 ? "" : "s"}`
    : `${m.remaining} more listing${m.remaining === 1 ? "" : "s"}`;

export default function UnlockCards({ onlyMovers, onToggleMovers }: {
  onlyMovers?: boolean;
  onToggleMovers?: (on: boolean) => void;
}) {
  const [state, setState] = useState<State | null>(null);
  const [term, setTerm] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [looking, setLooking] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    fetch("/api/unlocks").then(r => r.json() as Promise<State>).then(setState).catch(() => undefined);
  }, []);

  if (!state) return null;
  const at = (key: string) => state.milestones.find(m => m.key === key);
  const thirty = at("full-drop"), movers = at("climbers"), lookup = at("lookup"), history = at("vault");

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!term.trim() || looking) return;
    setLooking(true); setNote(""); setFound(null);
    try {
      /* no-store: an open tab must not reuse a keyword answer from before a
         safety repair. */
      const response = await fetch(`/api/whats-selling?keyword=${encodeURIComponent(term.trim())}`, { cache: "no-store" });
      const result = await response.json() as { listings?: Found[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Etsy did not answer.");
      setFound(result.listings ?? []);
      if (!result.listings?.length) setNote("Etsy returned nothing for that.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Etsy did not answer.");
    } finally { setLooking(false); }
  }

  return <section className="unlock-panel" aria-label="What listing this week has opened">
    <div className="unlock-rail">
      {/* Status, not a control — seeing thirty instead of ten simply happens. */}
      <div className={`unlock-item${thirty?.unlocked ? " on" : ""}`}>
        <span className="unlock-name">All 30 per category</span>
        <span className="unlock-state">{thirty?.unlocked ? "Open" : togo(thirty)}</span>
      </div>

      <button
        type="button"
        className={`unlock-item control${movers?.unlocked ? " on" : ""}${onlyMovers ? " active" : ""}`}
        disabled={!movers?.unlocked}
        onClick={() => onToggleMovers?.(!onlyMovers)}
      >
        <span className="unlock-name">Only new &amp; climbing</span>
        <span className="unlock-state">
          {!movers?.unlocked ? togo(movers) : onlyMovers ? "On" : "Off"}
        </span>
      </button>

      <div className={`unlock-item wide${lookup?.unlocked ? " on" : ""}`}>
        <span className="unlock-name">Look up any keyword</span>
        {lookup?.unlocked
          ? <form className="unlock-search" onSubmit={search}>
              <input type="search" value={term} onChange={e => setTerm(e.target.value)}
                placeholder="Type a keyword" aria-label="Look up a keyword on Etsy" />
              <button type="submit" disabled={!term.trim() || looking}>{looking ? "…" : "Search"}</button>
            </form>
          : <span className="unlock-state">{togo(lookup)}</span>}
      </div>

      <div className={`unlock-item${history?.unlocked ? " on" : ""}`}>
        <span className="unlock-name">30 days of history</span>
        <span className="unlock-state">{history?.unlocked ? "Open" : togo(history)}</span>
      </div>
    </div>

    <p className="unlock-week">
      <b>{state.listings}</b> listing{state.listings === 1 ? "" : "s"} this week
      {state.sets > 0 && <> · <b>{state.sets}</b> set{state.sets === 1 ? "" : "s"}</>}
      <span className="unlock-reset"> · resets Monday</span>
    </p>

    {note && <p className="unlock-note" role="status">{note}</p>}

    {found && found.length > 0 && <div className="unlock-found">
      <p className="mini-label">TOP ON ETSY FOR &ldquo;{term.trim()}&rdquo;</p>
      <div className="drop-grid">
        {found.slice(0, 10).map(item => <figure key={item.url} className="drop-card">
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="drop-shot">
            {item.image
              /* eslint-disable-next-line @next/next/no-img-element */
              ? <img src={item.image} alt={item.title} />
              : <span className="drop-noshot">No picture</span>}
          </a>
          <figcaption>
            <p className="drop-figures">
              <span className="drop-numeral">{item.favorites.toLocaleString()}</span>
              <span className="drop-unit">{item.favorites === 1 ? "save" : "saves"}</span>
            </p>
            <a className="drop-title" href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
          </figcaption>
        </figure>)}
      </div>
    </div>}
  </section>;
}
