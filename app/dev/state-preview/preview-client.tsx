"use client";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { stateFixtures, fixtureFor, replyFor, type StateFixture } from "@/app/state-fixtures";
import { conditionsOf, MOBILE_GATE, PHONE_WIDTHS,
  type SweepReading, type SweepConditions } from "@/app/sweep-conditions";
/* The feature stylesheets are imported by each ROUTE, not by the component, so
   mounting a component directly gives unstyled markup. The preview imports the
   same files the routes do — not copies of them. */
import "@/app/connections/connections.css";
import "@/app/market-watch/market-watch.css";
import "@/app/interface-v2.css";
import "@/app/design-scanner/design-scanner.css";
import "@/app/shop-map/shop-map.css";
import ConnectionsClient from "@/app/connections/connections-client";
import MarketWatchClient from "@/app/market-watch/market-watch-client";
import BatchesPage from "@/app/batches/page";
import ListingFactoryApp from "@/app/listing-factory-app";
import DesignScannerClient from "@/app/design-scanner/design-scanner-client";
import ShopMapClient from "@/app/shop-map/shop-map-client";
import AccountClient from "@/app/account/settings/account-client";
import HomeView from "@/app/home/home-view";
import FactoryShell from "@/app/factory-shell";
import TrademarkPage from "@/app/trademark/page";
import UsagePage from "@/app/usage/page";
import KeywordBanks from "@/app/keywords/page";
import MoreView from "@/app/more/more-view";
import "@/app/suite-redesign.css";
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
/*
  A REFUSAL BEFORE ANYONE IS LISTENING IS STILL A REFUSAL.

  Refusals were reported by dispatching a window event, and the panel attached
  its listener in an effect. The requests most likely to be unfixtured are the
  ones a surface fires on mount — and those fire before the listener exists,
  so they were dropped silently. Every "no unfixtured requests" reading taken
  from this panel was worth less than it looked: the shell's own /api/usage
  call was being refused on several fixtures and the panel showed nothing.

  Buffered on `window` instead, so a listener that arrives late still sees
  everything. One object per page, shared by every chunk — the same reason the
  confirmation dialog stopped using a module-level singleton.
*/
type RefusalBuffer = { seen: string[] };

const refusalBuffer = (): RefusalBuffer => {
  const host = window as unknown as { __statePreviewRefusals?: RefusalBuffer };
  if (!host.__statePreviewRefusals) host.__statePreviewRefusals = { seen: [] };
  return host.__statePreviewRefusals;
};

function noteRefusal(what: string) {
  const buffer = refusalBuffer();
  if (!buffer.seen.includes(what)) buffer.seen.push(what);
  window.dispatchEvent(new CustomEvent("state-preview:refused", { detail: what }));
}

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
        noteRefusal(`${method} ${url}`);
        return new Response(JSON.stringify({ error: "Blocked by state preview." }),
          { status: 503, headers: { "Content-Type": "application/json" } });
      }

      const reply = replyFor(fixture, url, method);
      if (!reply) {
        noteRefusal(url);
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

/*
  THE SHELL IS PART OF THE PAGE.

  Components were mounted bare, so every screenshot showed a feature floating
  on white with no rail, no page title and none of the shell's own rules
  applying — and the shell's rules are scoped to `.app-shell`, so the fixtures
  were being reviewed in a cascade the member never sees. Surfaces whose real
  route wraps them in the shell are wrapped here too; the ones that mount it
  themselves are left alone.
*/
const Shell = ({ active, title, children }:
  { active: "home" | "market-watch" | "shop-map" | "design-scanner" | "connections" | "more";
    title: string; children: React.ReactNode }) =>
  <FactoryShell active={active} title={title} desktopOnly={false}>{children}</FactoryShell>;

/* Every surface is given the same props; most ignore `at`, which is what
   makes adding a sub-view to one of them a one-line change. */
const SURFACES: Record<string, (props: { at?: string }) => ReactElement> = {
  connections: () => <Shell active="connections" title="Connections">
    <ConnectionsClient signedInEmail="preview@example.invalid" /></Shell>,
  "market-watch": ({ at }: { at?: string }) =>
    <Shell active="market-watch" title="Market Watch">
      <MarketWatchClient signedInEmail="preview@example.invalid"
        startTab={at === "shops" ? "shops" : "niches"} /></Shell>,
  "design-scanner": () => <Shell active="design-scanner" title="Design Scanner">
    <DesignScannerClient signedInEmail="preview@example.invalid" /></Shell>,
  "shop-map": () => <Shell active="shop-map" title="Shop Map">
    <ShopMapClient signedInEmail="preview@example.invalid" /></Shell>,
  account: () => <Shell active="more" title="Account">
    <AccountClient email="preview@example.invalid" /></Shell>,
  batches: () => <BatchesPage />,
  /* The whole workflow, mounted against a closed network. Its own
     stylesheets come in through the shell imports above. */
  "listing-factory": () => <ListingFactoryApp />,
  /* The pages that previously could only be seen with a member's session. */
  home: () => <Shell active="home" title="Home"><HomeView /></Shell>,
  trademark: ({ at }: { at?: string }) => <TrademarkPage initialPhrase={at} />,
  usage: () => <UsagePage />,
  keywords: () => <KeywordBanks />,
  more: () => <Shell active="more" title="Tools & settings"><MoreView /></Shell>,
};

/*
  EVERY STATE, EVERY PHONE WIDTH — AND AN HONEST LABEL ON WHAT THAT PROVES.

  An iframe 375 CSS pixels wide gives the page a real narrow viewport and
  makes its width media queries fire. It does NOT make the browser report a
  touch device, and this product's mobile rules require BOTH halves:

    @media (max-width: 820px) and (pointer: coarse)

  is what hides the Listing Factory shell behind the desktop gate. A sweep
  that satisfies the width and not the pointer proves narrow-width layout and
  nothing about touch behaviour, so it says so rather than calling itself
  mobile verification. Real mobile verification is the in-app browser's
  device emulation, and authenticated mobile states stay unverified until
  there is a safe authenticated emulation path.

  Every run reports the conditions it actually ran under — the viewport the
  page saw, whether the pointer was coarse, and whether the product's own
  mobile gate matched — so the result can never be read as more than it is.

  Chrome's window resize is not an alternative: the page stays 1440 CSS
  pixels wide however small the window gets, which is why narrow-width checks
  through it have never measured anything.
*/

async function sweepOne(state: string, width: number): Promise<SweepReading> {
  const frame = document.createElement("iframe");
  frame.style.cssText =
    `position:fixed;left:-9999px;top:0;width:${width}px;height:900px;border:0`;
  frame.src = `/dev/state-preview?state=${encodeURIComponent(state)}`;
  document.body.appendChild(frame);
  await new Promise(resolve => { frame.onload = resolve; setTimeout(resolve, 6_000); });
  await new Promise(resolve => setTimeout(resolve, 350));

  const reading: SweepReading = { state, askedWidth: width, innerWidth: null,
    clientWidth: null, coarsePointer: null, mobileGateMatches: null,
    horizontalOverflow: null, undersizedTargets: [], problems: [] };
  try {
    const doc = frame.contentDocument!;
    const view = frame.contentWindow!;
    reading.innerWidth = view.innerWidth;
    reading.clientWidth = doc.documentElement.clientWidth;
    reading.coarsePointer = view.matchMedia("(pointer: coarse)").matches;
    reading.mobileGateMatches = view.matchMedia(MOBILE_GATE).matches;

    const main = doc.querySelector("main");
    if (!main) reading.problems.push("nothing rendered");
    else {
      reading.horizontalOverflow = main.scrollWidth - view.innerWidth;
      if (reading.horizontalOverflow > 0)
        reading.problems.push(`scrolls sideways by ${reading.horizontalOverflow}px`);
      for (const node of main.querySelectorAll("*"))
        if (node.getBoundingClientRect().width > view.innerWidth + 1)
          reading.problems.push(`wider than the screen: ${node.tagName.toLowerCase()}`);
      for (const node of main.querySelectorAll("button, a, select")) {
        const box = node.getBoundingClientRect();
        if (box.width > 0 && box.height > 0 && box.height < 40) {
          const said = `${Math.round(box.height)}px tap target: `
            + `${(node.textContent ?? "").trim().slice(0, 24)}`;
          reading.undersizedTargets.push(said);
          reading.problems.push(said);
        }
      }
    }
    const refused = doc.querySelector(".sp-refused")?.textContent?.trim();
    if (refused) reading.problems.push(refused.slice(0, 80));
  } catch { reading.problems.push("could not be measured"); }
  frame.remove();
  reading.problems = [...new Set(reading.problems)];
  return reading;
}

const summarise = (seen: Map<string, Set<string>>) =>
  [...seen.entries()].map(([line, where]) => {
    const places = [...where];
    return places.length === 1 ? `${line} (${places[0]})`
      : `${line} (${places.length} places, e.g. ${places[0]})`;
  });

export default function StatePreviewClient({ initial }: { initial: string }) {
  const all = useMemo(() => stateFixtures(), []);
  const [key, setKey] = useState(initial || all[0].key);
  const fixture = useMemo(() => fixtureFor(key), [key]);
  const [refused, setRefused] = useState<string[]>([]);
  useClosedNetwork(fixture);

  useEffect(() => {
    /* Whatever was refused before this listener existed, plus whatever comes
       next. The buffer is cleared when the fixture changes, not when the
       listener mounts. */
    const buffer = (window as unknown as { __statePreviewRefusals?: { seen: string[] } })
      .__statePreviewRefusals;
    if (buffer) buffer.seen = [];
    setRefused([]);
    const catchUp = window.setTimeout(() => {
      const seen = (window as unknown as { __statePreviewRefusals?: { seen: string[] } })
        .__statePreviewRefusals?.seen ?? [];
      if (seen.length) setRefused(current => [...new Set([...current, ...seen])]);
    }, 1_500);
    const onRefused = (event: Event) =>
      setRefused(current => {
        const url = String((event as CustomEvent).detail);
        return current.includes(url) ? current : [...current, url];
      });
    window.addEventListener("state-preview:refused", onRefused);
    return () => {
      window.clearTimeout(catchUp);
      window.removeEventListener("state-preview:refused", onRefused);
    };
  }, [key]);

  const Surface = fixture ? SURFACES[fixture.surface] : null;

  const [sweep, setSweep] = useState<{ running: boolean; done: number; total: number;
    problems: string[]; conditions: SweepConditions | null } | null>(null);
  /*
    The sweep opens each state in an iframe, and those iframes render this
    same component. Set after mount rather than read during render, because
    this page is server-rendered first and `window` does not exist there.
  */
  const [topLevel, setTopLevel] = useState(false);
  useEffect(() => { setTopLevel(window.self === window.top); }, []);

  const runSweep = async () => {
    const total = all.length * PHONE_WIDTHS.length;
    setSweep({ running: true, done: 0, total, problems: [], conditions: null });
    /*
      GROUPED BY THE PROBLEM, NOT BY THE MEASUREMENT.

      One 19px link on Connections reported as six lines — two states times
      three widths — and the first run read as eighteen problems when there
      were two. A list long enough to scroll past is a list nobody reads.
    */
    const seen = new Map<string, Set<string>>();
    const readings: SweepReading[] = [];
    let done = 0;
    for (const width of PHONE_WIDTHS)
      for (const entry of all) {
        const reading = await sweepOne(entry.key, width);
        readings.push(reading);
        for (const line of reading.problems) {
          const where = seen.get(line) ?? new Set<string>();
          where.add(`${entry.key} @${width}`);
          seen.set(line, where);
        }
        done += 1;
        setSweep({ running: true, done, total, problems: summarise(seen),
          conditions: conditionsOf(readings) });
      }
    setSweep({ running: false, done: total, total, problems: summarise(seen),
      conditions: conditionsOf(readings) });
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
        {sweep && !sweep.running && sweep.conditions && (
          <>
            <span className={sweep.problems.length === 0 ? "sp-sweep-ok" : "sp-sweep-bad"}>
              {sweep.problems.length === 0
                ? `${sweep.total} checks clean.`
                : `${sweep.problems.length} problem`
                  + `${sweep.problems.length === 1 ? "" : "s"}: `
                  + sweep.problems.slice(0, 6).join(" · ")
                  + (sweep.problems.length > 6 ? " …" : "")}
            </span>
            {/* The conditions, every run, so nothing here reads as more than
                it is. `label` is the honest name for what was proved. */}
            <span className="sp-sweep-conditions">
              <b>{sweep.conditions.label}</b>
              {" · widths asked "}{sweep.conditions.widths.join("/")}
              {" · viewport "}{sweep.conditions.viewports.join("/")}
              {" · clientWidth "}{sweep.conditions.clientWidths.join("/")}
              {" · pointer:coarse "}{String(sweep.conditions.coarsePointer)}
              {" · mobile gate "}
              {sweep.conditions.mobileGateMatched ? "matched" : "never matched"}
              {" · worst horizontal overflow "}{sweep.conditions.worstOverflow}{"px"}
              {" · undersized targets "}{sweep.conditions.undersized}
            </span>
            {!sweep.conditions.coarsePointer && (
              <span className="sp-sweep-caveat">
                The pointer was never coarse, so this proves narrow-width layout
                only. Touch behaviour and the desktop gate are verified in the
                in-app browser&apos;s device emulation, not here.
              </span>
            )}
          </>
        )}
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
