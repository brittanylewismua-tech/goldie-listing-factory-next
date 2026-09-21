"use client";

import { useEffect, useRef, useState } from "react";
import type { FullVerdict } from "../trademark-check";
import "./trademark.css";
import FactoryShell from "@/app/factory-shell";


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

/* `initialPhrase` exists for the state preview: it runs the same check the
   member's keystroke would, so a match state can be seen without one. */
/*
  A CLASS NUMBER IS NOT AN ANSWER.

  The record said "class 021" — a Nice classification code that means nothing
  to a seller deciding whether to print a phrase. It now says what the class
  covers, with the number kept for anyone who wants to look it up.
*/
const CLASS_NAMES: Record<string, string> = {
  "003": "cosmetics", "009": "electronics", "014": "jewellery",
  "016": "paper and stationery", "018": "bags and leather",
  "020": "furniture", "021": "housewares and mugs", "024": "textiles",
  "025": "clothing", "026": "trims and patches", "028": "toys and games",
  "030": "food", "032": "non-alcoholic drinks", "033": "alcoholic drinks", "035": "retail and advertising",
  "041": "entertainment and classes", "043": "food and drink services",
};
const classPhrase = (classes: string[]) => {
  const named = classes.map(code => {
    const key = code.padStart(3, "0");
    return CLASS_NAMES[key] ? `${CLASS_NAMES[key]} (class ${key})` : `class ${key}`;
  });
  return named.join(", ");
};

export default function TrademarkPage({ initialPhrase }: { initialPhrase?: string } = {}) {
  const [phrase, setPhrase] = useState(initialPhrase ?? "");
  const [verdict, setVerdict] = useState<FullVerdict | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [watches, setWatches] = useState<Array<{ phrase: string; risk: string;
    changed: boolean; pending: boolean; matches: number }>>([]);
  const [watchBusy, setWatchBusy] = useState("");

  const loadWatches = async () => {
    try {
      const response = await fetch("/api/trademark/watches", { cache: "no-store" });
      if (!response.ok) throw new Error("Your watched phrases could not be loaded.");
      const body = await response.json() as { watches?: typeof watches };
      setWatches(body.watches ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your watched phrases could not be loaded."); }

  };
  useEffect(() => { void loadWatches(); }, []);

  const started = useRef(false);
  useEffect(() => {
    if (!initialPhrase || started.current) return;
    started.current = true;
    void run(initialPhrase);
    /* Once, on mount, for the preview only. */
  }, [initialPhrase]);

  async function run(value: string, acknowledgeWatch = false) {
    const term = value.trim();
    if (!term || checking) return;
    setChecking(true); setError(""); setVerdict(null);
    try {
      const response = await fetch(
        `/api/trademark?phrase=${encodeURIComponent(term)}`, { cache: "no-store" });
      const result = await response.json() as FullVerdict & { error?: string };
      if (!response.ok) throw new Error(result.error || "That could not be checked.");
      setVerdict(result);
      if (acknowledgeWatch) {
        const acknowledged=await fetch("/api/trademark/watches", { method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phrase: term }) });
        if(!acknowledged.ok)throw new Error("The result loaded, but your watch could not be marked reviewed. Please try again.");
        await loadWatches();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "That could not be checked.");
    } finally { setChecking(false); }
  }

  async function watchPhrase() {
    const term = (verdict?.phrase || phrase).trim();
    if (!term) return;
    await updateWatch(term, false);
  }

  async function removeWatch(term: string) {
    await updateWatch(term, true);
  }

  async function updateWatch(term: string, remove: boolean) {
    if (watchBusy) return;
    setWatchBusy(term); setError("");
    try {
      const response = await fetch(remove ? `/api/trademark/watches?phrase=${encodeURIComponent(term)}` : "/api/trademark/watches", {
        method: remove ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        ...(remove ? {} : { body: JSON.stringify({ phrase: term }) }),
      });
      if (!response.ok) throw new Error(remove ? "That phrase could not be removed. Please try again." : "That phrase could not be watched. Please try again.");
      await loadWatches();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Please try again."); }
    finally { setWatchBusy(""); }
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

  const body = (<>
    <div className="tm-page interior-page p-grid">
      <header className="drop-head">
        <p className="mini-label p-eyebrow">TRADEMARK TRACKER</p>
        <h1>Check it before you print it</h1>
        <p>Find matching marks and review their status and product categories.</p>
      </header>

      <form className="tm-form" onSubmit={event => { event.preventDefault(); run(phrase); }}>
        <input
          className="p-input"
          type="search"
          value={phrase}
          onChange={event => setPhrase(event.target.value)}
          placeholder="Type a title, phrase or design idea"
          aria-label="Phrase to check"
        />
        <button className="p-button p-button-primary" type="submit"
          disabled={!phrase.trim() || checking}>
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

      {watches.length > 0 && <section className="tm-watches" aria-labelledby="tm-watches-title">
        <div className="tm-watches-head"><div><p className="mini-label">WATCHED PHRASES</p>
          <h2 id="tm-watches-title">Status changes show up here.</h2></div></div>
        <div className="tm-watch-list">{watches.map(watch => <article key={watch.phrase}
          className={watch.changed ? "changed" : ""}>
          <div><strong>{watch.phrase}</strong><span>{watch.changed
            ? `${watch.matches || "New"} ${watch.matches === 1 ? "result needs" : "results need"} review${watch.pending ? " · pending application found" : ""}`
            : watch.pending ? "Pending application found"
              : watch.matches ? `${watch.matches} matching record${watch.matches === 1 ? "" : "s"}`
                : "No matching record found"}</span></div>
          <span className={`tm-watch-risk ${watch.risk}`}>{watch.matches ? "Review matches" : "No match found"}</span>
          <button type="button" onClick={() => { setPhrase(watch.phrase); void run(watch.phrase, true); }}>Review</button>
          <button type="button" className="quiet" disabled={watchBusy === watch.phrase}
            onClick={() => void removeWatch(watch.phrase)}>Remove</button>
        </article>)}</div>
      </section>}

      {error && <section className="drop-error p-notice p-notice-bad" role="alert">
        <h2>This could not be checked</h2>
        <p>{error}</p>
      </section>}

      {verdict && <section className={`tm-verdict ${verdict.risk}`} aria-live="polite">
        {/* The verdict wears the product's status treatment, so risk reads the
            same here as everywhere else in the suite. */}
        <span className={verdict.risk === "high" ? "p-badge p-badge-bad"
          : verdict.risk === "caution" ? "p-badge p-badge-warn" : "p-badge p-badge-good"}>
          {verdict.risk === "clear" ? "No match found" : "Matches to review"}
        </span>
        {/*
          D1691 · The clear result said "Nothing found" twice — once as the
          badge, once as the headline directly beneath it. The other two risks
          use the badge for the verdict and the headline for what to do about
          it ("High risk" → "Do not print this"), and a clear result has no
          instruction to give: the only honest thing to add would be
          encouragement to go ahead, which this tool cannot give. So it has no
          headline rather than an echo of its own badge.
        */}
        {verdict.risk !== "clear" && (
          <p className="tm-headline">
            {"Review the matching names and categories"}
          </p>
        )}
        <p className="tm-phrase">{marked()}</p>
        <p>{(verdict.register ?? []).length > 0
          ? `${verdict.register!.length} matching record${verdict.register!.length === 1 ? "" : "s"}. A pending application is not a registration. Compare the goods and services with your intended product.`
          : verdict.risk === "clear" ? "No matching mark was found for this phrase. This does not establish that the phrase is available to use."
            : "This phrase contains a brand or name that needs review before use."}</p>

        {verdict.hits.length > 0 && <ul className="tm-hits">
          {verdict.hits.map((hit, index) =>
            <li key={`${hit.at}-${index}`} className="tm-hit">
              <b>{hit.matched}</b>
              <span className="tm-owner">owned by {hit.owner}</span>
              <span className="tm-cat">{hit.category}</span>
            </li>)}
        </ul>}

        {/* The register's own findings, kept visually separate from the
            curated list: they are a different kind of fact and a seller
            should be able to tell which one is talking. */}
        {(verdict.register ?? []).length > 0 && <ul className="tm-hits tm-register p-card-quiet">
          {(verdict.register ?? []).map((match, index) =>
            /* Two records for one brand share a mark and carry no
               registration number until they register, so the previous key
               collided and React kept only one of them. */
            <li key={`${match.mark}-${match.classes.join("-")}-${index}`} className="tm-hit">
              <b>{match.mark}</b>
              {match.owner && <span className="tm-owner">
                {match.registered ? "registered to" : "filed by"} {match.owner}</span>}
              <span className="tm-cat">
                {match.registered ? "live registration" : "pending application"}
                {match.classes.length ? ` · ${classPhrase(match.classes)}` : ""}
              </span>
              {/^\d+$/.test(match.serial ?? "") && <a href={`https://tsdr.uspto.gov/#caseNumber=${encodeURIComponent(match.serial ?? "")}&caseSearchType=US_APPLICATION&caseType=DEFAULT&searchType=statusSearch`} target="_blank" rel="noopener noreferrer">View trademark record ↗</a>}
            </li>)}
        </ul>}
        <button className="tm-watch-button" type="button" disabled={watchBusy === verdict.phrase}
          onClick={() => void watchPhrase()}>{watches.some(watch => watch.phrase.toLowerCase() === verdict.phrase.toLowerCase())
            ? "Update watched phrase" : "Watch this phrase"}</button>
      </section>}

      <p className="tm-note">
        A clear result means nothing was found rather than nobody owns it.{" "}
        {verdict && verdict.registerReady === false &&
          <strong>Search results are currently incomplete. Try again later.</strong>}
        {" "}This is screening information, not legal advice.
      </p>
    </div>
</>);

  /*
    THE CHECKER IS NOT A FACTORY PAGE — AND IT IS STILL A GOLDIE PAGE.

    It rendered inside FactoryShell, which carried the desktop gate, so on a
    phone it told members to find a bigger screen. That was fixed for mobile
    and left alone on desktop, which turned out to be half a fix: on a wide
    screen it still appeared inside the Listing Factory, with the factory's
    sidebar, its "Start a new batch" button, and a "198 / 10,000 listings"
    counter from the retired three-tier plan — none of which has anything to
    do with checking a phrase.

    So it was pulled out of the shell altogether, and that was the other half
    of the mistake: it then had no wordmark, no navigation, no footer and no
    link back to anything. Screenshotted beside the Listing Factory it read as
    a different piece of software.

    Both were the same confusion — the shell mixing what belongs to the
    product as a whole with what belongs to the Listing Factory. The shell separates them now:
    the checker wears the product's chrome and none of the factory's controls,
    and `desktopOnly={false}` keeps it working on a phone.
  */
  /* The body carries its own header ("Check it before you print it"), so this
     wrapper adds none: stacking a second heading above it read as three
     titles in a row. */
  return (
    <FactoryShell active="trademark" title="Trademark Tracker" desktopOnly={false}>
      <main className="tm-standalone">{body}</main>
    </FactoryShell>
  );
}
