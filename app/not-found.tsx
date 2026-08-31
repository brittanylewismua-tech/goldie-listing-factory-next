import Link from "next/link";
import FactoryShell from "./factory-shell";

/* D261 · A wrong URL dropped the seller onto Next's stock white 404 — no
   branding, no navigation, no way back into the app except the browser's back
   button. Every other surface in Goldie is the lilac shell.
   D818 · It said that and then rendered outside the shell, in Manrope with a
   10px eyebrow and an Arial fallback. It renders the shell now, like the rest
   of the interior. */
export default function NotFound() {
  return (
    <FactoryShell active="factory" title="Page not found">
      <div className="interior-page not-found-page">
        <header>
          <p className="mini-label">PAGE NOT FOUND</p>
          <h1>That page has moved or never existed.</h1>
          <p>
            Nothing has happened to your batches. Your saved products, keyword banks and
            Printify drafts are exactly where you left them.
          </p>
        </header>
        <div className="not-found-actions">
          <Link className="not-found-primary" href="/listing-factory">Back to Listing Factory</Link>
          <Link className="not-found-secondary" href="/batches">Batch History</Link>
        </div>
      </div>
    </FactoryShell>
  );
}
