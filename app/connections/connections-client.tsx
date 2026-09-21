"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  /*
    AND A FAILED LOAD IS NOT AN EMPTY ONE EITHER.

    Found with the state preview on the `connections-api-error` fixture: when
    both endpoints fail, `loaded` becomes true with `shops` still empty, so the
    page showed the error notice AND "No Etsy shop connected yet" underneath
    it. The same false claim as before, reached through the other door.
  */
  const [failed, setFailed] = useState(false);
  const [salesImport, setSalesImport] = useState<"" | "running" | "done" | "failed">("");
  const [salesImportError, setSalesImportError] = useState("");
  const salesImportStarted = useRef(false);

  const load = useCallback(async () => {
    try {
      const [etsy, print] = await Promise.all([
        fetch("/api/shop-map/connections"),
        fetch("/api/connections/printify"),
      ]);
      if (etsy.ok) setShops(((await etsy.json()) as { connections: Connection[] }).connections ?? []);
      if (print.ok) setPrintify(await print.json() as Printify);
      if (!etsy.ok && !print.ok) {
        setFailed(true);
        setError("Your connections could not be loaded just now. Nothing has changed — "
          + "reload the page to try again.");
      }
    } catch {
      setFailed(true);
      setError("Your connections could not be loaded just now. Nothing has changed — "
        + "reload the page to try again.");
    } finally { setLoaded(true); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /*
    ETSY APPROVAL IS THE START OF THE JOB, NOT THE FINISH LINE.

    Sales permission used to return to a raw capability response and leave the
    member with no import at all. The callback now returns here with a narrow
    success marker. This page reads the shop's real receipts, listing sales,
    fees, reviews and Printify costs in bounded passes, then reloads the
    connection facts. Every endpoint is read-only against Etsy and Printify.
  */
  useEffect(() => {
    if (typeof window === "undefined" || salesImportStarted.current) return;
    const parameters = new URLSearchParams(window.location.search);
    const result = parameters.get("etsy_sales");
    if (result === "missing") {
      setSalesImport("failed");
      setSalesImportError("Etsy returned without the sales permission. Try the sales connection again.");
      return;
    }
    /*
      Closing the browser after Etsy approval used to strand the connection in
      an awkward half-state: permission was saved, but the import only started
      when the callback query string was still present. A connected shop with
      sales permission and no successful sync is the same unfinished job, so
      resume it automatically. This does not ask Etsy for permission again and
      does not change the active Listing Factory shop.
    */
    const unfinished = loaded && shops.some(shop =>
      shop.activeForListingFactory && shop.canReadSales
      && !shop.needsReconnect && !shop.lastSyncAt);
    if (result !== "connected" && !unfinished) return;
    salesImportStarted.current = true;
    setSalesImport("running");
    if (result === "connected") window.history.replaceState({}, "", "/connections");

    let alive = true;
    const post = async (url: string) => {
      const response = await fetch(url, { method: "POST" });
      const body = await response.json().catch(() => ({})) as {
        error?: string; complete?: boolean; errors?: string[]; ledger?: { windowsOutstanding?: number }; salesStored?: number;
      };
      if (!response.ok) throw new Error(body.error || "The import did not finish.");
      return body;
    };

    void (async () => {
      try {
        /* Finance needs a full receipt pass once; ledger windows then finish
           in bounded follow-up passes without repeating that backfill. */
        let finance = await post(
          "/api/shop-map/financial/ingest?backfill=1&windows=25&receipts=40&orders=10");
        for (let pass = 0; pass < 3 && Number(finance.ledger?.windowsOutstanding ?? 0) > 0; pass += 1)
          finance = await post(
            "/api/shop-map/financial/ingest?windows=25&receipts=6&orders=10");
        if (!finance.complete) throw new Error(finance.errors?.[0] || "Some financial history still needs to load. Use Refresh your numbers in Shop Map to continue.");
        await post("/api/shop-map/financial/reconcile");

        /* A receipt can contain several sold listings. Walk enough bounded
           pages for the owner's known shop history, while the route safely
           stops on the first short or empty Etsy page. */
        for (let salesFrom = 0; salesFrom < 40; salesFrom += 8)
          await post(`/api/shop-map/listings?sales=1&salesFrom=${salesFrom}&receipts=8`
            + (salesFrom === 0 ? "&pages=20&listings=1&reviews=1" : ""));

        if (!alive) return;
        setSalesImport("done");
        await load();
      } catch (reason) {
        if (!alive) return;
        setSalesImport("failed");
        setSalesImportError(reason instanceof Error ? reason.message : "The import did not finish.");
      }
    })();
    return () => { alive = false; };
  }, [load, loaded, shops]);

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
      {salesImport === "running" && (
        <p className="p-notice" role="status">
          Sales access is approved. Importing sold listings, revenue, Etsy fees, and Printify costs now…
        </p>
      )}
      {salesImport === "done" && (
        <p className="p-notice" role="status">
          Your sales data is loaded. <a href="/shop-map">Open Shop Map</a>
        </p>
      )}
      {salesImport === "failed" && (
        <p className="p-notice p-notice-bad" role="alert">{salesImportError}</p>
      )}
      {!loaded && (
        <div className="p-stack" role="status" aria-label="Checking your connections">
          <div className="p-skeleton p-skeleton-card" />
        </div>
      )}
      {loaded && !failed && shops.length === 0 && (
        /*
          D1633 · The one thing to do here was a word inside a sentence — a
          19px tap target at 375px wide, found by the phone-width sweep. The
          action is the point of this state, so it is an action.
        */
        <div className="empty">
          <p>No Etsy shop connected yet. Connecting it is what everything else here uses.</p>
          <a className="p-button p-button-primary" href="/api/etsy/connect">Connect your shop</a>
        </div>
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
      {loaded && !failed && <div className="shop">
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

    </main>
    </FactoryShell>
  );
}
