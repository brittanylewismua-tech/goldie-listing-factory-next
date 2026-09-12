"use client";

import { useEffect, useState } from "react";

/**
 * WHAT LISTING THIS WEEK HAS OPENED — AS CONTROLS, NOT A LIST.
 *
 * This was a row of four labels that read as buttons and did nothing when
 * pressed. Two of them name real actions, so they are real controls now: a
 * keyword box that searches Etsy, and a switch that filters the shelf down to
 * what moved. The third is not an action at all — seeing thirty instead of ten
 * simply happens — so it is stated as a fact rather than dressed as a button.
 *
 * A locked control stays visible and disabled, and says what would open it.
 * Hiding it would remove the only reason to list; making it look pressable
 * while it is not is how an interface teaches people it lies.
 *
 * THE REVEAL IS GONE. Every five listings used to turn over a card carrying
 * one observation from the day's drop. It dispensed trivia, repeated the same
 * category several presses running, and said things like "climbing in Tote
 * Bags, moved up to number 43" about a shelf thirty items long. One daily
 * snapshot does not hold enough real news to fill a dispenser.
 */

type Milestone = { key: string; name: string; unlocked: boolean; remaining: number; needsSets: number };
type State = { listings: number; sets: number; credits: number; milestones: Milestone[] };
type Found = { title: string; url: string; image: string | null; favorites: number; rank: number };

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
  const has = (key: string) => state.milestones.find(m => m.key === key);
  const movers = has("climbers");
  const lookup = has("lookup");
  const thirty = has("full-drop");

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!term.trim() || looking) return;
    setLooking(true); setNote(""); setFound(null);
    try {
      const response = await fetch(`/api/whats-selling?keyword=${encodeURIComponent(term.trim())}`);
      const result = await response.json() as { listings?: Found[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Etsy did not answer.");
      setFound(result.listings ?? []);
      if (!result.listings?.length) setNote("Etsy returned nothing for that.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Etsy did not answer.");
    } finally { setLooking(false); }
  }

  return <section className="unlock-panel" aria-label="What listing this week has opened">
    <p className="unlock-week">
      <b>{state.listings}</b> listing{state.listings === 1 ? "" : "s"} this week
      {state.sets > 0 && <> · <b>{state.sets}</b> set{state.sets === 1 ? "" : "s"}</>}
    </p>

    <div className="unlock-tools">
      <form className="unlock-search" onSubmit={search}>
        <input
          type="search"
          value={term}
          onChange={event => setTerm(event.target.value)}
          disabled={!lookup?.unlocked}
          placeholder={lookup?.unlocked ? "Look up any keyword on Etsy" : `Look up any keyword — ${lookup?.remaining} more listings`}
          aria-label="Look up a keyword on Etsy"
        />
        <button type="submit" disabled={!lookup?.unlocked || !term.trim() || looking}>
          {looking ? "Looking…" : "Search"}
        </button>
      </form>

      <button
        type="button"
        className={`unlock-toggle${onlyMovers ? " on" : ""}`}
        disabled={!movers?.unlocked}
        onClick={() => onToggleMovers?.(!onlyMovers)}
        title={movers?.unlocked ? undefined : `${movers?.remaining} more listings`}
      >
        {onlyMovers ? "Showing what moved" : "Only what moved since yesterday"}
        {!movers?.unlocked && <small> · {movers?.remaining} more listings</small>}
      </button>
    </div>

    {/* Not an action — it simply happens. Said, not dressed up as a control. */}
    <p className="unlock-fact">
      {thirty?.unlocked
        ? "You are seeing all 30 in every category."
        : `Showing the top 10 in each category — ${thirty?.remaining} more listings shows all 30.`}
      {" One design on 3 products counts for more than 3 separate listings."}
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
