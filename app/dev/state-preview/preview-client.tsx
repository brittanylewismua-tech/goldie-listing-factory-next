"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { stateFixtures, fixtureFor, replyFor, type StateFixture } from "@/app/state-fixtures";
/* The feature stylesheets are imported by each ROUTE, not by the component, so
   mounting a component directly gives unstyled markup. The preview imports the
   same files the routes do — not copies of them. */
import "@/app/connections/connections.css";
import "@/app/market-watch/market-watch.css";
import "@/app/design-scanner/design-scanner.css";
import "@/app/shop-map/shop-map.css";
import ConnectionsClient from "@/app/connections/connections-client";
import MarketWatchClient from "@/app/market-watch/market-watch-client";
import DesignScannerClient from "@/app/design-scanner/design-scanner-client";
import ShopMapClient from "@/app/shop-map/shop-map-client";
import AccountClient from "@/app/account/settings/account-client";
import "@/app/account/settings/account.css";

/**
 * THE REAL COMPONENT, IN A STATE THAT WOULD OTHERWISE HAVE TO BE WAITED FOR.
 *
 * Two rules make this trustworthy rather than a mock:
 *
 *   1. It mounts the SHIPPING component. Nothing here re-implements a page, so
 *      what is on screen is what a member gets, including every stylesheet.
 *   2. The network is CLOSED. `fetch` is replaced for the lifetime of the
 *      preview and answers only from the fixture table; anything the table does
 *      not cover is refused locally and never leaves the browser. A preview
 *      therefore cannot reach Etsy, Printify, Stripe or a model provider, and
 *      cannot write anything anywhere, regardless of what the component tries.
 *
 * The refusal is deliberately visible in the console rather than silent, so a
 * fixture that forgot an endpoint shows up as a gap to fill instead of an
 * inexplicably stuck component.
 */
/*
  INSTALLED DURING RENDER, NOT IN AN EFFECT.

  A first version patched `fetch` in a `useEffect`. React runs a CHILD's
  effects before its parent's, so the component being previewed had already
  fired its real requests by the time the interceptor existed — the preview
  showed live production data wearing a fixture's label, which is worse than
  showing nothing.

  Patching in the parent's render body happens before any child mounts.
*/
function useClosedNetwork(fixture: StateFixture | null) {
  const patched = useRef<{ key: string; real: typeof window.fetch } | null>(null);

  if (typeof window !== "undefined" && fixture && patched.current?.key !== fixture.key) {
    const real = patched.current?.real ?? window.fetch;
    patched.current = { key: fixture.key, real };

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input
        : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? "GET").toUpperCase();

      /* A preview never writes, whatever the fixture says. */
      if (method !== "GET" && method !== "HEAD" && !replyFor(fixture, url)) {
        window.dispatchEvent(new CustomEvent("state-preview:refused",
          { detail: `${method} ${url}` }));
        return new Response(JSON.stringify({ error: "Blocked by state preview." }),
          { status: 503, headers: { "Content-Type": "application/json" } });
      }

      const reply = replyFor(fixture, url);
      if (!reply) {
        window.dispatchEvent(new CustomEvent("state-preview:refused", { detail: url }));
        return new Response(JSON.stringify({ error: "No fixture for this request." }),
          { status: 503, headers: { "Content-Type": "application/json" } });
      }
      if (reply.delayMs) await new Promise(resolve => setTimeout(resolve, reply.delayMs));
      return new Response(JSON.stringify(reply.body),
        { status: reply.status, headers: { "Content-Type": "application/json" } });
    }) as typeof window.fetch;
  }

  /* Put the real one back when the preview unmounts. */
  useEffect(() => () => {
    if (patched.current) { window.fetch = patched.current.real; patched.current = null; }
  }, []);
}

const SURFACES = {
  connections: () => <ConnectionsClient signedInEmail="preview@example.invalid" />,
  "market-watch": () => <MarketWatchClient signedInEmail="preview@example.invalid" />,
  "design-scanner": () => <DesignScannerClient signedInEmail="preview@example.invalid" />,
  "shop-map": () => <ShopMapClient signedInEmail="preview@example.invalid" />,
  account: () => <AccountClient email="preview@example.invalid" />,
} as const;

export default function StatePreviewClient({ initial }: { initial: string }) {
  const all = useMemo(() => stateFixtures(), []);
  const [key, setKey] = useState(initial || all[0].key);
  const fixture = useMemo(() => fixtureFor(key), [key]);
  const [refused, setRefused] = useState<string[]>([]);
  useClosedNetwork(fixture);

  useEffect(() => {
    setRefused([]);
    const onRefused = (event: Event) =>
      setRefused(current => {
        const url = String((event as CustomEvent).detail);
        return current.includes(url) ? current : [...current, url];
      });
    window.addEventListener("state-preview:refused", onRefused);
    return () => window.removeEventListener("state-preview:refused", onRefused);
  }, [key]);

  const Surface = fixture ? SURFACES[fixture.surface] : null;

  return <div className="state-preview">
    <header className="sp-bar">
      <div className="sp-title">
        <b>State preview</b>
        <span>Real components · network closed · nothing is written</span>
      </div>
      <label className="sp-pick">
        <span>State</span>
        <select className="p-select" value={key} onChange={event => setKey(event.target.value)}>
          {all.map(entry => (
            <option key={entry.key} value={entry.key}>
              {entry.surface} — {entry.label}
            </option>
          ))}
        </select>
      </label>
    </header>
    {fixture && <p className="sp-what">{fixture.what}</p>}
    {refused.length > 0 && (
      <p className="sp-refused" role="status">
        Refused {refused.length} request{refused.length === 1 ? "" : "s"} with no fixture:{" "}
        {refused.slice(0, 3).join(", ")}
        {refused.length > 3 ? "…" : ""}
      </p>
    )}
    <div className="sp-stage">{Surface ? <Surface /> : null}</div>
  </div>;
}
