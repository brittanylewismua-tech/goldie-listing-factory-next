"use client";

import { useEffect, useState } from "react";

/**
 * WHAT LISTING THIS WEEK HAS OPENED.
 *
 * This was four boxes in a row, all the same size and shape, of which two did
 * something and two were labels. "The whole board" sat there looking exactly
 * like a control and was not one; the tier next to it was a real switch
 * wearing the same clothes. The art direction is explicit — one primary action
 * per decision area, secondary actions never compete — and a row of identical
 * tiles with mixed behaviour breaks that on both counts. It read as amateur
 * because it was.
 *
 * So it is one thing now: a count, a track, and the next reward named in a
 * sentence. Progress is progress; it is not a button and no longer pretends
 * to be. The only actual control here is the keyword field, which appears when
 * it is available and is absent when it is not, rather than sitting greyed out
 * in a box.
 *
 * The reward for the board itself is communicated where it is felt — the
 * locked card at the end of the grid, in context — not as an abstract tile
 * above it.
 */

type Milestone = { key: string; name: string; unlocked: boolean; remaining: number; needsSets: number };
type State = { listings: number; sets: number; credits: number; milestones: Milestone[] };
type Found = { title: string; url: string; image: string | null; favorites: number };

/** "3 more listings" / "2 more sets" — one counter, worded the same everywhere. */
const togo = (m?: Milestone) =>
  !m ? "" : m.needsSets
    ? `${m.remaining} more set${m.remaining === 1 ? "" : "s"}`
    : `${m.remaining} more listing${m.remaining === 1 ? "" : "s"}`;

/** Plain names, because a tier key is not a thing anybody should have to read. */
const NAMES: Record<string, string> = {
  "full-drop": "the whole board",
  climbers: "longer time windows",
  lookup: "keyword lookup",
  vault: "30 days of history",
};

export default function UnlockCards() {
  const [state, setState] = useState<State | null>(null);
  const [term, setTerm] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [looking, setLooking] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    fetch("/api/unlocks").then(r => r.json() as Promise<State>).then(setState).catch(() => undefined);
  }, []);

  if (!state) return null;

  const lookup = state.milestones.find(m => m.key === "lookup");

  /* The nearest thing still shut, which is the only one worth naming. Naming
     all four turns a nudge into a chore list. */
  const next = state.milestones
    .filter(m => !m.unlocked)
    .sort((a, b) => a.remaining - b.remaining)[0];

  /* How far through the current step, not through everything: a bar that
     crawls across four tiers reads as hopeless in week one. */
  const target = next ? next.remaining + (next.needsSets ? state.sets : state.listings) : 1;
  const done = next ? (next.needsSets ? state.sets : state.listings) : 1;
  const percent = Math.max(4, Math.min(100, Math.round((done / Math.max(1, target)) * 100)));

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

  return <section className="unlock-strip" aria-label="What listing this week has opened">
    <div className="unlock-progress">
      <p className="unlock-count">
        <b>{state.listings}</b> listing{state.listings === 1 ? "" : "s"} this week
        {state.sets > 0 && <> and <b>{state.sets}</b> set{state.sets === 1 ? "" : "s"}</>}
      </p>
      <span className="unlock-track" aria-hidden="true"><i style={{ width: `${percent}%` }} /></span>
      <p className="unlock-next">
        {next
          ? <>{togo(next)} opens {NAMES[next.key] ?? next.name}</>
          : <>Everything is open this week</>}
        <span className="unlock-reset"> · resets Monday</span>
      </p>
    </div>

    {lookup?.unlocked && <form className="unlock-search" onSubmit={search}>
      <input type="search" value={term} onChange={e => setTerm(e.target.value)}
        placeholder="Look up a keyword" aria-label="Look up a keyword on Etsy" />
      <button type="submit" disabled={!term.trim() || looking}>{looking ? "Searching" : "Search"}</button>
    </form>}

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
