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
  "030": "food", "032": "drinks", "035": "retail and advertising",
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

  const started = useRef(false);
  useEffect(() => {
    if (!initialPhrase || started.current) return;
    started.current = true;
    void run(initialPhrase);
    /* Once, on mount, for the preview only. */
  }, [initialPhrase]);

  async function run(value: string) {
    const term = value.trim();
    if (!term || checking) return;
    setChecking(true); setError(""); setVerdict(null);
    try {
      const response = await fetch(
        `/api/trademark?phrase=${encodeURIComponent(term)}`, { cache: "no-store" });
      const result = await response.json() as FullVerdict & { error?: string };
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

  const body = (<>
    <div className="tm-page interior-page p-grid">
      <header className="drop-head">
        <p className="mini-label p-eyebrow">TRADEMARK CHECK</p>
        <h1>Check it before you print it</h1>
        <p>Names, characters and brands that get listings removed.</p>
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

      {error && <section className="drop-error p-notice p-notice-bad" role="alert">
        <h2>This could not be checked</h2>
        <p>{error}</p>
      </section>}

      {verdict && <section className={`tm-verdict ${verdict.risk}`} aria-live="polite">
        {/* The verdict wears the product's status treatment, so risk reads the
            same here as everywhere else in the suite. */}
        <span className={verdict.risk === "high" ? "p-badge p-badge-bad"
          : verdict.risk === "caution" ? "p-badge p-badge-warn" : "p-badge p-badge-good"}>
          {verdict.risk === "high" ? "High risk"
            : verdict.risk === "caution" ? "Partly owned" : "Nothing found"}
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
            {verdict.risk === "high"
              ? "Do not print this"
              : "Somebody owns part of this"}
          </p>
        )}
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
            </li>)}
        </ul>}
      </section>}

      <p className="tm-note">
        <strong>What this checks.</strong> Two things. The brands, characters, franchises,
        teams and artists that listings actually get removed for — and live US trademark
        records, taken from USPTO's own published data. Marks outside the classes
        print-on-demand sellers use are counted when the phrase is the brand itself.{" "}
        {verdict && verdict.registerReady === false &&
          <strong>The register is still loading, so treat a clean result as incomplete today.</strong>}
        {" "}It is not legal advice, and a clean result means nothing was found rather than
        nobody owns it. If you are about to build a whole product line on a phrase, have it
        searched properly first.
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
    <FactoryShell active="trademark" title="Trademark Checker" desktopOnly={false}>
      <main className="tm-standalone">{body}</main>
    </FactoryShell>
  );
}
