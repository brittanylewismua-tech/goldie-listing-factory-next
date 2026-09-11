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
      else setNote("Today's drop has nothing new to put on a card yet. This one stays yours — try after tomorrow's read.");
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
        ? `${state.unopened} card${state.unopened > 1 ? "s" : ""} waiting`
        : `${state.remaining} more to your next card`}</p>
      {/* Said every week, because it is the whole argument for bundles: the
          same three listings are worth five as a set and three apart. */}
      <p className="unlock-sets">{state.sets > 0
        ? `${state.sets} set${state.sets > 1 ? "s" : ""} this week — one design on three products is worth 5, the same three apart are worth 3.`
        : "One design on a tee, a sweatshirt and a hoodie counts as 5. The same three listings apart count as 3."}</p>
    </div>

    {/* Face-down, and drawn as an object rather than a button, because the
        wanting is the whole feature. */}
    <button type="button" className={`unlock-card facedown${state.unopened > 0 ? " ready" : ""}`}
      onClick={crack} disabled={state.unopened === 0 || turning}
      aria-label={state.unopened > 0 ? "Turn your card" : `${state.remaining} more listings to your next card`}>
      <span className="unlock-back" aria-hidden>✦</span>
      <span className="unlock-cta">{turning ? "Turning…" : state.unopened > 0 ? "Turn it over" : `${state.remaining} to go`}</span>
    </button>

    {note && <p className="unlock-note" role="status">{note}</p>}

    {just && <article className="unlock-card open just" role="status">
      <p className="unlock-kind">{just.category}</p>
      <h3>{just.title}</h3>
      <p className="unlock-line">{just.line}</p>
      {just.listing && <a href={just.listing.url} target="_blank" rel="noopener noreferrer">{just.listing.title}</a>}
    </article>}

    {next
      ? <p className="unlock-next">
          <strong>{next.name}</strong> at {next.needsSets ? `${next.at} sets` : next.at} this week — {next.remaining} to go. {next.blurb}
        </p>
      : <p className="unlock-next"><strong>Everything is open.</strong> The week turns over on Monday and the shelf is new again.</p>}

    {state.opened.length > 0 && <details className="unlock-history">
      {/* Kept forever, and said so. The week's access re-locks on Monday;
          what they turned does not go anywhere, and knowing that is what stops
          the reset feeling like a confiscation. */}
      <summary>{state.opened.length} card{state.opened.length > 1 ? "s" : ""} turned — yours to keep</summary>
      <ul>{state.opened.map(card => <li key={card.ordinal}>
        <strong>{card.title}</strong> — {card.line}
        {card.listing && <> <a href={card.listing.url} target="_blank" rel="noopener noreferrer">see it</a></>}
      </li>)}</ul>
    </details>}
  </section>;
}
