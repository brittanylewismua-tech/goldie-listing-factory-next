"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * WHAT IS CONNECTED, AND WHAT HAPPENS IF YOU DISCONNECT IT.
 *
 * Two things this screen refuses to do. It never says "scope" — a seller
 * should not have to learn OAuth vocabulary to understand their own account.
 * And it never offers to delete a connection: disconnecting retires it, so the
 * shop keeps its place, its history survives, and reconnecting resumes rather
 * than starting over.
 *
 * Publishing and reading sales are shown as separate facts, because they are:
 * authorising sales access on one shop must not change which shop the Listing
 * Factory publishes to, and the page says which one that is.
 */
type Connection = {
  shopId: number; shopName: string;
  activeForListingFactory: boolean;
  canReadSales: boolean;
  needsReconnect: boolean;
  authorizeSalesUrl: string | null;
  lastSyncAt?: number | null;
};

type Printify = { connected: boolean; shopName?: string; shopId?: number | null;
  lastSyncAt?: number | null };

const when = (seconds?: number | null) => {
  /* Only when it genuinely never has. A missing field is not evidence that a
     shop has never synced, and saying so was false for a shop with three
     thousand ingested receipts. */
  if (!seconds) return "not recorded yet";
  const gap = Math.max(0, Math.floor(Date.now() / 1000) - seconds);
  if (gap < 3_600) return `${Math.max(1, Math.round(gap / 60))} minutes ago`;
  if (gap < 172_800) return `${Math.round(gap / 3_600)} hours ago`;
  return `${Math.round(gap / 86_400)} days ago`;
};

import FactoryShell from "@/app/factory-shell";

export default function ConnectionsClient({ signedInEmail }: { signedInEmail: string }) {
  void signedInEmail;
  const [shops, setShops] = useState<Connection[]>([]);
  const [printify, setPrintify] = useState<Printify | null>(null);
  const [showEffect, setShowEffect] = useState<number | null>(null);
  const [error, setError] = useState("");
  /*
    D1609 · "NO ETSY SHOP CONNECTED YET" WAS SHOWN WHILE LOADING.

    The empty state and the not-yet-answered state were the same thing, so for
    the seconds this page takes to read two connection endpoints it told the
    member their shop was disconnected. Measured on the deployed build: about
    six seconds of "No Etsy shop connected yet" and "Not connected", on an
    account where both are connected and the Listing Factory was publishing to
    that very shop.

    An empty state is a CLAIM. It may only be made once there is an answer.
  */
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [etsy, print] = await Promise.all([
        fetch("/api/shop-map/connections"),
        fetch("/api/connections/printify"),
      ]);
      if (etsy.ok) setShops(((await etsy.json()) as { connections: Connection[] }).connections ?? []);
      if (print.ok) setPrintify(await print.json() as Printify);
      if (!etsy.ok && !print.ok)
        setError("Your connections could not be loaded just now. Nothing has changed — "
          + "reload the page to try again.");
    } catch {
      setError("Your connections could not be loaded just now. Nothing has changed — "
        + "reload the page to try again.");
    } finally { setLoaded(true); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <FactoryShell active="connections" title="Connections" desktopOnly={false}>
    <main className="conn p-grid">
      <h1>Connections</h1>
      <p className="lede">
        The Listing Factory reads your Etsy shop so it can build listings and show you what
        they earned. It never changes a listing you did not ask it to.
      </p>

      {error && <p className="p-notice p-notice-bad" role="alert">{error}</p>}

      <h2>Etsy</h2>
      {!loaded && (
        <div className="p-stack" role="status" aria-label="Checking your connections">
          <div className="p-skeleton p-skeleton-card" />
        </div>
      )}
      {loaded && shops.length === 0 && (
        <p className="empty">
          No Etsy shop connected yet. <a href="/api/etsy/connect">Connect your shop</a> to
          start using it.
        </p>
      )}
      {shops.map(shop => (
        <div className="shop" key={shop.shopId}>
          <span className="name">{shop.shopName}</span>
          <div className="badges">
            {shop.activeForListingFactory
              ? <span className="badge" data-on="yes">Publishing here</span>
              : <span className="badge">Not the publishing shop</span>}
            {shop.canReadSales
              ? <span className="badge" data-on="yes">Sales visible</span>
              : <span className="badge">Sales not shared</span>}
            {shop.needsReconnect && <span className="badge" data-on="warn">Needs reconnecting</span>}
          </div>
          <p className="fact">Last successful sync: {when(shop.lastSyncAt)}</p>
          {!shop.canReadSales && (
            <p className="fact">
              Shop Map needs your permission to read this shop&apos;s sales before it
              can show what it earned.
            </p>
          )}
          {shop.needsReconnect && (
            <p className="fact">
              Access to this shop has lapsed. Reconnecting brings it
              back with everything it already knows.
            </p>
          )}
          <div className="row">
            {shop.needsReconnect && <a href="/api/etsy/connect">Reconnect</a>}
            {!shop.canReadSales && shop.authorizeSalesUrl && (
              <a href={shop.authorizeSalesUrl}>Let the platform see sales</a>
            )}
            {!shop.activeForListingFactory && !shop.needsReconnect && (
              <a href={`/api/etsy/set-active?shop=${shop.shopId}`}>Publish to this shop</a>
            )}
            <button className="quiet"
              onClick={() => setShowEffect(showEffect === shop.shopId ? null : shop.shopId)}>
              Disconnect
            </button>
          </div>
          {showEffect === shop.shopId && (
            <div className="effect">
              <p>
                Disconnecting stops any reading or publishing to{" "}
                <strong>{shop.shopName}</strong>. Your Etsy listings are not touched.
                What was already recorded is kept, so if you reconnect later it
                picks up where it left off rather than starting again.
              </p>
              <div className="row">
                <a href={`/api/etsy/disconnect?shop=${shop.shopId}`}>Yes, disconnect</a>
                <button className="quiet" onClick={() => setShowEffect(null)}>Keep it</button>
              </div>
            </div>
          )}
        </div>
      ))}

      <h2>Printify</h2>
      {!loaded && (
        <div className="p-stack" role="status" aria-label="Checking your Printify connection">
          <div className="p-skeleton p-skeleton-card" />
        </div>
      )}
      {loaded && <div className="shop">
        <span className="name">{printify?.connected ? (printify.shopName || "Connected") : "Not connected"}</span>
        <p className="fact">
          {printify?.connected
            ? `Last successful sync: ${when(printify.lastSyncAt)}`
            : "The Listing Factory needs Printify to build listings, and Shop Map needs it to work out what each order cost you to make."}
        </p>
        <div className="row">
          {printify?.connected
            ? <a href="/api/printify/connect">Reconnect</a>
            : <a href="/api/printify/connect">Connect Printify</a>}
        </div>
      </div>}

      {error && <p className="error">{error}</p>}
    </main>
    </FactoryShell>
  );
}
