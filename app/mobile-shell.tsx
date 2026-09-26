"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * GOLDIE ON A PHONE.
 *
 * A bottom bar, a service worker, and a prompt to put it on the home screen.
 * Deliberately not a second application: the same routes, the same accounts,
 * the same data — laid out for a thumb.
 *
 * THE BAR ONLY EXISTS WHERE IT HELPS. It stays out of the Listing Factory
 * workspace, which is a desktop tool, and off the marketing and sign-in
 * pages, where a five-tab bar would be noise around a single decision.
 */
/* The center shortcut opens the live niche research tool. The retired
   scanner route redirects to Shop Map and is not a distinct destination. */
const TABS = [
  { href: "/home", label: "Home", glyph: "◆" },
  { href: "/market-watch", label: "Watch", glyph: "◈" },
  { href: "/market-watch/research", label: "Niches", glyph: "⊚" },
  { href: "/shop-map", label: "My Shop", glyph: "▦" },
  { href: "/more", label: "More", glyph: "≡" },
];

/* Sign-in and landing pages: a five-tab bar around one decision is noise. */
const BARE = [/^\/$/, /^\/account\/sign-in/, /^\/signup/, /^\/auth/];

/*
  THE LISTING FACTORY IS A DESKTOP TOOL AND SAYS SO.

  Bulk editing across many products, large image sets, mockup selection and
  publishing controls do not survive being squeezed onto a phone — they become
  a worse version of themselves that still lets somebody publish twenty wrong
  listings. Saying so plainly is kinder than a cramped workspace, and the
  member's saved work is untouched either way.
*/
const WORKSPACE = [/^\/listing-factory/, /^\/listingfactory/];

export default function MobileShell() {
  const pathname = usePathname() ?? "/";
  const activeHref = TABS.filter(tab => pathname === tab.href || pathname.startsWith(`${tab.href}/`))
    .sort((a,b) => b.href.length - a.href.length)[0]?.href;
  const [installable, setInstallable] = useState<null | "ios" | "prompt">(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    /*
      Registered from the client after load so it can never delay first paint,
      and only in production: a stale worker on a dev machine is a genuinely
      confusing hour to spend.
    */
    if ("serviceWorker" in navigator && location.hostname !== "localhost")
      navigator.serviceWorker.register("/service-worker.js").catch(() => undefined);

    /* Already installed: the prompt would be nonsense. */
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (window.navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    let asked = "";
    try { asked = localStorage.getItem("goldie-install-asked") ?? ""; } catch { /* private mode */ }
    if (asked) return;

    const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (iOS) {
      /* Safari offers no install event; the member has to be shown where the
         button is, so the walkthrough is the only route. */
      setInstallable("ios");
      setDismissed(false);
      return;
    }
    const onPrompt = (event: Event) => {
      event.preventDefault();
      (window as { goldieInstallEvent?: Event }).goldieInstallEvent = event;
      setInstallable("prompt");
      setDismissed(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const remember = () => {
    try { localStorage.setItem("goldie-install-asked", "1"); } catch { /* private mode */ }
    setDismissed(true);
  };

  if (BARE.some(pattern => pattern.test(pathname))) return null;

  if (WORKSPACE.some(pattern => pattern.test(pathname)))
    return <aside className="desktop-only-notice" role="note">
      <a className="mobile-notice-brand" href="/home">Goldie Suite</a>
      <b>Create listings on a computer.</b>
      <p>
        Listing Factory’s artwork and bulk editors need a larger screen. Your saved work is ready when you return.
      </p>
      <nav className="mobile-work-links"><a href="/batches">Batch History</a><a href="/home">All tools</a></nav>
    </aside>;

  return <>
    <nav className="goldie-tabs" aria-label="Main">
      {TABS.map(tab => {
        const current = tab.href === activeHref;
        return <a key={tab.href} href={tab.href} className={current ? "current" : ""}
          aria-current={current ? "page" : undefined}>
          <span aria-hidden="true">{tab.glyph}</span>
          <em>{tab.label}</em>
        </a>;
      })}
    </nav>

    {!dismissed && installable && <aside className="goldie-install" role="dialog" aria-label="Add to your home screen">
      <div>
        <b>Keep these tools on your home screen</b>
        <p>{installable === "ios"
          ? "In Safari, open Share, choose Add to Home Screen, then tap Add. If shown, keep Open as Web App turned on."
          : "Install it and it opens like an app, without the browser bars."}</p>
      </div>
      <div className="goldie-install-actions">
        {installable === "prompt" && <button type="button" onClick={async () => {
          const event = (window as { goldieInstallEvent?: { prompt?: () => Promise<void> } }).goldieInstallEvent;
          await event?.prompt?.().catch(() => undefined);
          remember();
        }}>Install</button>}
        <button type="button" className="quiet" onClick={remember}>Not now</button>
      </div>
    </aside>}
  </>;
}
