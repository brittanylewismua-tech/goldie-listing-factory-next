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
const TABS = [
  { href: "/home", label: "Home", glyph: "◆" },
  { href: "/hot-list", label: "Watch", glyph: "◈" },
  { href: "/shop-map", label: "My Shop", glyph: "▦" },
  { href: "/trademark", label: "Check", glyph: "✓" },
  { href: "/account", label: "More", glyph: "≡" },
];

/* Routes that are a workspace, a sign-in, or a landing page. */
const BARE = [/^\/$/, /^\/account\/sign-in/, /^\/signup/, /^\/auth/, /^\/listing-factory/, /^\/listingfactory/, /^\/batches/];

export default function MobileShell() {
  const pathname = usePathname() ?? "/";
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

    const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
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

  return <>
    <nav className="goldie-tabs" aria-label="Goldie">
      {TABS.map(tab => {
        const current = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return <a key={tab.href} href={tab.href} className={current ? "current" : ""}
          aria-current={current ? "page" : undefined}>
          <span aria-hidden="true">{tab.glyph}</span>
          <em>{tab.label}</em>
        </a>;
      })}
    </nav>

    {!dismissed && installable && <aside className="goldie-install" role="dialog" aria-label="Add Goldie to your home screen">
      <div>
        <b>Keep Goldie on your home screen</b>
        <p>{installable === "ios"
          ? "Tap the share button below, then Add to Home Screen. Goldie opens like an app, without the browser bars."
          : "Install Goldie and it opens like an app, without the browser bars."}</p>
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
