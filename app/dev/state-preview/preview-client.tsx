"use client";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
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
      if (method !== "GET" && method !== "HEAD" && !replyFor(fixture, url, method)) {
        window.dispatchEvent(new CustomEvent("state-preview:refused",
          { detail: `${method} ${url}` }));
        return new Response(JSON.stringify({ error: "Blocked by state preview." }),
          { status: 503, headers: { "Content-Type": "application/json" } });
      }

      const reply = replyFor(fixture, url, method);
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

/* Every surface is given the same props; most ignore `at`, which is what
   makes adding a sub-view to one of them a one-line change. */
const SURFACES: Record<string, (props: { at?: string }) => ReactElement> = {
  connections: () => <ConnectionsClient signedInEmail="preview@example.invalid" />,
  "market-watch": ({ at }: { at?: string }) =>
    <MarketWatchClient signedInEmail="preview@example.invalid"
      startTab={at === "shops" ? "shops" : "niches"} />,
  "design-scanner": () => <DesignScannerClient signedInEmail="preview@example.invalid" />,
  "shop-map": () => <ShopMapClient signedInEmail="preview@example.invalid" />,
  account: () => <AccountClient email="preview@example.invalid" />,
};

/*
  EVERY STATE, EVERY PHONE WIDTH, IN ONE PASS.

  The states were swept by hand once — twenty-two of them at 375, 390 and
  430 — and a sweep done by hand is a sweep done once. Each state is loaded
  into an iframe of that exact width, which gives the page a real CSS
  viewport and makes its media queries fire, and is then measured for the
  four things that actually go wrong at phone width: the page scrolling
  sideways, an element wider than the screen, a tap target under 40px, and a
  request no fixture answered.

  It reads; it changes nothing. The previews it opens have their own closed
  network, so this cannot reach anything either.
*/
const PHONE_WIDTHS = [375, 390, 430];

async function sweepOne(state: string, width: number): Promise<string[]> {
  const frame = document.createElement("iframe");
  frame.style.cssText =
    `position:fixed;left:-9999px;top:0;width:${width}px;height:900px;border:0`;
  frame.src = `/dev/state-preview?state=${encodeURIComponent(state)}`;
  document.body.appendChild(frame);
  await new Promise(resolve => { frame.onload = resolve; setTimeout(resolve, 6_000); });
  await new Promise(resolve => setTimeout(resolve, 350));
  const found: string[] = [];
  try {
    const doc = frame.contentDocument!;
    const view = frame.contentWindow!;
    const main = doc.querySelector("main");
    if (!main) found.push("nothing rendered");
    else {
      const over = main.scrollWidth - view.innerWidth;
      if (over > 0) found.push(`scrolls sideways by ${over}px`);
      for (const node of main.querySelectorAll("*"))
        if (node.getBoundingClientRect().width > view.innerWidth + 1)
          found.push(`wider than the screen: ${node.tagName.toLowerCase()}`);
      for (const node of main.querySelectorAll("button, a, select")) {
        const box = node.getBoundingClientRect();
        if (box.width > 0 && box.height > 0 && box.height < 40)
          found.push(`${Math.round(box.height)}px tap target: `
            + `${(node.textContent ?? "").trim().slice(0, 24)}`);
      }
    }
    const refused = doc.querySelector(".sp-refused")?.textContent?.trim();
    if (refused) found.push(refused.slice(0, 80));
  } catch { found.push("could not be measured"); }
  frame.remove();
  return [...new Set(found)];
}

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

  const [sweep, setSweep] = useState<{ running: boolean; done: number; total: number;
    problems: string[] } | null>(null);
  /*
    The sweep opens each state in an iframe, and those iframes render this
    same component. Set after mount rather than read during render, because
    this page is server-rendered first and `window` does not exist there.
  */
  const [topLevel, setTopLevel] = useState(false);
  useEffect(() => { setTopLevel(window.self === window.top); }, []);

  const runSweep = async () => {
    const total = all.length * PHONE_WIDTHS.length;
    setSweep({ running: true, done: 0, total, problems: [] });
    const problems: string[] = [];
    let done = 0;
    for (const width of PHONE_WIDTHS)
      for (const entry of all) {
        for (const line of await sweepOne(entry.key, width))
          problems.push(`${entry.key} @${width}: ${line}`);
        done += 1;
        setSweep({ running: true, done, total, problems: [...problems] });
      }
    setSweep({ running: false, done: total, total, problems });
  };

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
    {topLevel && (
      <p className="sp-sweep">
        <button type="button" className="p-button p-button-quiet"
          onClick={() => void runSweep()} disabled={sweep?.running}>
          {sweep?.running
            ? `Checking ${sweep.done} of ${sweep.total}…`
            : "Check every state at phone widths"}
        </button>
        {sweep && !sweep.running && (sweep.problems.length === 0
          ? <span className="sp-sweep-ok">
              {sweep.total} checks clean — nothing scrolls sideways, nothing is wider
              than the screen, no tap target under 40px, no unanswered request.
            </span>
          : <span className="sp-sweep-bad">
              {sweep.problems.length} problem{sweep.problems.length === 1 ? "" : "s"}:{" "}
              {sweep.problems.slice(0, 6).join(" · ")}
              {sweep.problems.length > 6 ? " …" : ""}
            </span>)}
      </p>
    )}
    {refused.length > 0 && (
      <p className="sp-refused" role="status">
        Refused {refused.length} request{refused.length === 1 ? "" : "s"} with no fixture:{" "}
        {refused.slice(0, 3).join(", ")}
        {refused.length > 3 ? "…" : ""}
      </p>
    )}
    {/* `at` opens the sub-view the state actually lives in — keyed so
        switching fixtures remounts rather than keeping the previous tab. */}
    <div className="sp-stage">
      {Surface ? <Surface key={key} at={fixture?.at} /> : null}
    </div>
  </div>;
}
