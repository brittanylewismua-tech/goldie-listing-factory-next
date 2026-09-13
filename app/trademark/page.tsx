"use client";

import { useState } from "react";
import FactoryShell from "../factory-shell";
import type { Verdict } from "../trademark-check";
import "./trademark.css";

/**
 * TRADEMARK CHECK.
 *
 * The cheapest catastrophe in print-on-demand: a phrase somebody else owns,
 * printed, listed, removed. Repeat removals close shops.
 *
 * Two decisions shape this page.
 *
 * IT SHOWS WHICH WORD IS THE PROBLEM, not just that there is one. "This
 * phrase is risky" leaves a seller guessing which half to change; marking the
 * word inside their own sentence tells them what to edit in one glance.
 *
 * A CLEAN RESULT NEVER SAYS "SAFE". The list catches the traps people
 * actually fall into, not the whole federal register, and a tool that says
 * safe is making a promise it cannot keep — the promise somebody would quote
 * back after losing a shop over a mark it had never heard of.
 */

const EXAMPLES = [
  "in my mama era",
  "jesus loves you shirt",
  "taylor swift eras tour",
  "bluey birthday shirt",
];

export default function TrademarkPage() {
  const [phrase, setPhrase] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  async function run(value: string) {
    const term = value.trim();
    if (!term || checking) return;
    setChecking(true); setError(""); setVerdict(null);
    try {
      const response = await fetch(
        `/api/trademark?phrase=${encodeURIComponent(term)}`, { cache: "no-store" });
      const result = await response.json() as Verdict & { error?: string };
      if (!response.ok) throw new Error(result.error || "That could not be checked.");
      setVerdict(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That could not be checked.");
    } finally { setChecking(false); }
  }

  /* The phrase with each hit marked in place. Built from offsets rather than
     string replacement, so a word appearing twice marks both and a phrase
     containing regex characters cannot break the render. */
  const marked = () => {
    if (!verdict || !verdict.hits.length) return verdict?.phrase ?? "";
    const parts: React.ReactNode[] = [];
    let at = 0;
    verdict.hits.forEach((hit, index) => {
      if (hit.at < at) return; /* overlapping match, already covered */
      if (hit.at > at) parts.push(verdict.phrase.slice(at, hit.at));
      parts.push(<mark key={index}>{verdict.phrase.slice(hit.at, hit.at + hit.length)}</mark>);
      at = hit.at + hit.length;
    });
    if (at < verdict.phrase.length) parts.push(verdict.phrase.slice(at));
    return parts;
  };

  return <FactoryShell active="trademark" title="Trademark Check">
    <div className="tm-page interior-page">
      <header className="drop-head">
        <p className="mini-label">TRADEMARK CHECK</p>
        <h1>Check it before you print it</h1>
        <p>Names, characters and brands that get listings removed.</p>
      </header>

      <form className="tm-form" onSubmit={event => { event.preventDefault(); run(phrase); }}>
        <input
          type="search"
          value={phrase}
          onChange={event => setPhrase(event.target.value)}
          placeholder="Type a title, phrase or design idea"
          aria-label="Phrase to check"
        />
        <button type="submit" disabled={!phrase.trim() || checking}>
          {checking ? "Checking" : "Check"}
        </button>
      </form>

      {/* Real phrases rather than "try me" filler, so the first click shows
          the tool doing something true. */}
      <div className="tm-examples">
        {EXAMPLES.map(example =>
          <button key={example} type="button"
            onClick={() => { setPhrase(example); run(example); }}>{example}</button>)}
      </div>

      {error && <section className="drop-error" role="alert">
        <h2>This could not be checked</h2>
        <p>{error}</p>
      </section>}

      {verdict && <section className={`tm-verdict ${verdict.risk}`} aria-live="polite">
        <p className="tm-headline">
          {verdict.risk === "high" ? "Do not print this" : "Nothing known found"}
        </p>
        <p className="tm-phrase">{marked()}</p>
        <p>{verdict.summary}</p>

        {verdict.hits.length > 0 && <ul className="tm-hits">
          {verdict.hits.map((hit, index) =>
            <li key={`${hit.at}-${index}`} className="tm-hit">
              <b>{hit.matched}</b>
              <span className="tm-owner">owned by {hit.owner}</span>
              <span className="tm-cat">{hit.category}</span>
            </li>)}
        </ul>}
      </section>}

      <p className="tm-note">
        <strong>What this checks.</strong> The brands, characters, franchises, teams and
        artists that listings actually get removed for. It is not a search of the federal
        trademark register and it is not legal advice, so a clean result means none of the
        usual traps rather than nobody owns it. If you are about to build a whole product
        line on a phrase, search the register properly first.
      </p>
    </div>
  </FactoryShell>;
}
