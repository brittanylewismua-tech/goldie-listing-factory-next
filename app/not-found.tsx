import Link from "next/link";

/* D261 · A wrong URL dropped the seller onto Next's stock white 404 — no
   branding, no navigation, no way back into the app except the browser's back
   button. Every other surface in Goldie is the lilac shell. */
export default function NotFound() {
  return (
    <main className="not-found-page">
      <p className="mini-label">PAGE NOT FOUND</p>
      <h1>That page has moved or never existed.</h1>
      <p className="not-found-copy">
        Nothing has happened to your batches. Your saved products, keyword banks and
        Printify drafts are exactly where you left them.
      </p>
      <div className="not-found-actions">
        <Link className="not-found-primary" href="/listing-factory">Back to Listing Factory</Link>
        <Link className="not-found-secondary" href="/batches">Batch History</Link>
      </div>
    </main>
  );
}
