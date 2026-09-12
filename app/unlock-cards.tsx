"use client";

import { useEffect, useState } from "react";

/**
 * THE COUNTER, THE FACE-DOWN CARD, AND THE TURN.
 *
 * The unlock is not the mechanic. The mechanic is seeing the card sitting
 * there face-down with a number on it, which is why the locked state is drawn
 * at least as carefully as the open one and why the counter is visible whether
 * or not anything is owed.
 *
 * Nothing here is scored on whether a listing sold. The counter moves when
 * work goes out, which is the only part a seller controls, so it can only ever
 * go up.
 */

type Card = {
  ordinal: number; kind: string; title: string; line: string;
  category?: string; openedAt?: string;
  listing?: { title: string; url: string; image: string | null };
};
type Milestone = { at: number; key: string; name: string; blurb: string; unlocked: boolean; remaining: number; needsSets: number };
type State = {
  weekStart: string; listings: number; sets: number; credits: number; earned: number; openedThisWeek: number;
  unopened: number; toward: number; remaining: number;
  opened: Card[]; milestones: Milestone[];
};

export default function UnlockCards() {
  const [state, setState] = useState<State | null>(null);
  const [turning, setTurning] = useState(false);
  const [just, setJust] = useState<Card | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    fetch("/api/unlocks").then(r => r.json() as Promise<State>).then(setState).catch(() => undefined);
  }, []);

  async function crack() {
    if (turning) return;
    setTurning(true); setNote("");
    try {
      const response = await fetch("/api/unlocks", { method: "POST" });
      const result = await response.json() as State & { card: Card | null; error?: string };
      if (!response.ok) throw new Error(result.error || "That card would not turn.");
      setState(result);
      if (result.card) setJust(result.card);
      /* An empty pack must not spend the card. Said plainly, because a turn
         that appears to do nothing reads as broken. */
      else setNote("Nothing new to report yet today. This find is not spent — try again after tomorrow morning's read.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "That card would not turn.");
    } finally { setTurning(false); }
  }

  if (!state) return null;
  const next = state.milestones.find(m => !m.unlocked);

  return <section className="unlock-cards" aria-label="Your cards">
    <p className="mini-label">THIS WEEK</p>

    <div className="unlock-progress">
      <div className="unlock-track"><span style={{ width: `${(state.toward / (state.toward + state.remaining)) * 100}%` }} /></div>
      <p>{state.unopened > 0
        ? `${state.unopened} find${state.unopened > 1 ? "s" : ""} ready to read`
        : `${state.remaining} more listing${state.remaining > 1 ? "s" : ""} unlocks your next find`}</p>
    </div>

    {/* Face-down, and drawn as an object rather than a button, because the
        wanting is the whole feature. */}
    <button type="button" className={`unlock-card facedown${state.unopened > 0 ? " ready" : ""}`}
      onClick={crack} disabled={state.unopened === 0 || turning}
      aria-label={state.unopened > 0 ? "Read your next find" : `${state.remaining} more listings unlocks your next find`}>
      <span className="unlock-back" aria-hidden>✦</span>
      <span className="unlock-cta">{turning ? "Reading…" : state.unopened > 0 ? "Read it" : `${state.remaining} listings to go`}</span>
    </button>

    {note && <p className="unlock-note" role="status">{note}</p>}

    {just && <article className="unlock-card open just" role="status">
      <p className="unlock-kind">{just.category}</p>
      <h3>{just.title}</h3>
      <p className="unlock-line">{just.line}</p>
      {just.listing && <a href={just.listing.url} target="_blank" rel="noopener noreferrer" className="unlock-open-link">View on Etsy →</a>}
    </article>}

    {/* The ladder as a row of chips rather than a sentence about the next one.
        Seeing four rungs with two lit is the thing that pulls; a paragraph
        describing the next rung is not. */}
    <ul className="unlock-ladder">
      {state.milestones.map(m => <li key={m.key} className={m.unlocked ? "on" : undefined}>
        <span className="rung-mark" aria-hidden>{m.unlocked ? "\u2713" : ""}</span>
        <span className="rung-name">{m.name}</span>
        <span className="rung-at">{m.unlocked
          ? "unlocked"
          : m.needsSets
            ? `${m.remaining} more set${m.remaining > 1 ? "s" : ""}`
            : `${m.remaining} more listing${m.remaining > 1 ? "s" : ""}`}</span>
      </li>)}
    </ul>
    {/* One line, and only the line that changes behaviour. */}
    <p className="unlock-sets">{state.sets > 0
      ? `${state.sets} set${state.sets > 1 ? "s" : ""} this week — one design on 3+ products`
      : "One design on 3 products counts for more than 3 separate listings"}</p>

    {state.opened.length > 0 && <details className="unlock-history">
      {/* Kept forever, and said so. The week's access re-locks on Monday;
          what they turned does not go anywhere, and knowing that is what stops
          the reset feeling like a confiscation. */}
      <summary>Everything you have read ({state.opened.length}) — these stay yours</summary>
      <ul>{state.opened.map(card => <li key={card.ordinal}>
        <strong>{card.title}</strong> — {card.line}
        {card.listing && <> <a href={card.listing.url} target="_blank" rel="noopener noreferrer">View on Etsy</a></>}
      </li>)}</ul>
    </details>}
  </section>;
}
