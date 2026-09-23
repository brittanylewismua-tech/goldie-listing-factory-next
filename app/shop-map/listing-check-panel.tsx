"use client";
/* ============================================================================
 * D1798 · THE CHECK BELONGS ON THE LISTING.
 *
 * It lived on its own page with a dropdown of the member's listings - the same
 * listings Shop Map already holds, already shows, and already knows the sales
 * of. A separate page to pick from a list that exists two clicks away is a
 * second copy of the list, not a second tool.
 *
 * So it is here, on the listing, where the seller is already looking at what
 * it earned. Pick one, say what a buyer would type, and it is measured against
 * the fifty most favorited live listings for that phrase.
 * ==========================================================================*/
import { useEffect, useState } from "react";

type Mine = { listingId: number; title: string; tags: string[]; state: string;
  sold90: number; favorites: number | null; lastPriceCents: number | null };
type Finding = { key: string; kind: "gap" | "ok"; label: string; detail: string };

export default function ListingCheckPanel() {
  const [mine, setMine] = useState<Mine[]>([]);
  const [chosen, setChosen] = useState<Mine | null>(null);
  const [phrase, setPhrase] = useState("");
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [against, setAgainst] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/shop-map/my-listings")
      .then(response => response.ok ? response.json() as Promise<{ listings?: Mine[] }> : null)
      /* Worst first: favorites with nothing sold is the listing worth
         checking, and it is the one a seller never thinks to open. */
      .then(body => setMine((body?.listings ?? []).filter(row => row.state === "active")
        .sort((a, b) => (a.sold90 - b.sold90) || ((b.favorites ?? 0) - (a.favorites ?? 0)))))
      .catch(() => undefined);
  }, []);

  const run = async () => {
    if (!chosen) return;
    setBusy(true); setError(""); setFindings(null);
    try {
      const response = await fetch("/api/design-scanner/listing-check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phrase, title: chosen.title, tags: chosen.tags,
          priceCents: chosen.lastPriceCents ?? undefined, currency: "USD",
        }),
      });
      const body = await response.json() as { findings?: Finding[]; error?: string };
      if (!response.ok) throw new Error(body.error || "That check could not be completed.");
      setFindings(body.findings ?? []); setAgainst(phrase);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That check could not be completed.");
    } finally { setBusy(false); }
  };

  if (!mine.length) return null;
  const gaps = (findings ?? []).filter(finding => finding.kind === "gap");
  const matches = (findings ?? []).filter(finding => finding.kind === "ok");

  return <section className="cc-tool shop-map-check">
    <h2>Check a listing against its search</h2>
    <div className="shop-map-check-form">
      <label>Listing
        <select value={chosen ? String(chosen.listingId) : ""} onChange={event => {
          setChosen(mine.find(row => String(row.listingId) === event.target.value) ?? null);
          setFindings(null);
        }}>
          <option value="">Choose one…</option>
          {mine.map(row => <option key={row.listingId} value={row.listingId}>
            {row.sold90} sold · {row.title.slice(0, 64)}</option>)}
        </select>
      </label>
      <label>What would a buyer type to find it?
        <input className="p-input" value={phrase} placeholder="auntie shirt"
          onChange={event => setPhrase(event.target.value)} />
      </label>
      <button className="p-button p-button-primary" disabled={busy || !chosen || !phrase.trim()}
        onClick={() => void run()}>{busy ? "Checking…" : "Check"}</button>
    </div>
    {error && <p className="p-notice failed" role="alert">{error}</p>}
    {findings && <p className="shop-map-check-against">Top 50 for &ldquo;{against}&rdquo;</p>}
    {findings && !findings.length && <p className="empty">Nothing separates this from the winners
      on what can be measured here.</p>}
    {findings && findings.length > 0 && <div className="shop-map-check-findings">
      {[...gaps, ...matches].map(finding => <article key={finding.key}
        className={finding.kind === "gap" ? "finding finding-gap" : "finding finding-ok"}>
        <b>{finding.label}</b><p>{finding.detail}</p></article>)}
    </div>}
  </section>;
}
