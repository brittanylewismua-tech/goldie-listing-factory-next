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
/*
  SCAN SITS IN THE MIDDLE, AND THAT IS THE POINT.

  Uploading a design straight from the camera roll is the thing this can do
  on a phone that it cannot do better anywhere else, so it takes the centre
  position — the easiest place on the bar to reach with a thumb. The Trademark
  Checker moves into More with a shortcut on Home: it is a thing people do
  occasionally and deliberately, not something they need one tap from every
  screen.
*/
const TABS = [
  { href: "/home", label: "Home", glyph: "◆" },
  { href: "/market-watch", label: "Watch", glyph: "◈" },
  { href: "/design-scanner", label: "Scan", glyph: "⊚" },
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
const WORKSPACE = [/^\/listing-factory/, /^\/listingfactory/, /^\/batches/];

/*
  ONE EXCEPTION, AND IT IS DELIBERATE.

  Design Scanner belongs to the Listing Factory product — it is the preflight
  before a design becomes listings — but uploading a design from a phone's
  camera roll is the natural way to start. So it gets its own route and is
  explicitly NOT swept up by the desktop gate above.
*/
const SCANNER = /^\/design-scanner/;

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

  if (WORKSPACE.some(pattern => pattern.test(pathname)) && !SCANNER.test(pathname))
    return <aside className="desktop-only-notice" role="note">
      <b>Listing Factory is built for desktop.</b>
      <p>
        Your saved designs, batches and keyword banks are exactly where you left
        them, and they will be ready when you are back at your computer.
      </p>
      <a href="/home">Back to Home</a>
    </aside>;

  return <>
    <nav className="goldie-tabs" aria-label="Main">
      {TABS.map(tab => {
        const current = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
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
          ? "Tap the share button below, then Add to Home Screen. It opens like an app, without the browser bars."
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
