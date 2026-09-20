"use client";
/* ============================================================================
 * D818 · THE INTERIOR PAGES JOIN THE V2 SHELL
 *
 * Until now only /listing-factory rendered inside `.app-shell`. Batch History,
 * Keyword Banks, Usage + Plan, Goals, Mockups and Operations rendered a
 * bare `<main class="management-page">` at the body root, so every rule in
 * interface-v2.css - all of which are scoped to `.app-shell` - stopped at the
 * workflow. Those pages were still drawn by the legacy stack: Manrope from
 * management-aesthetic.css, Fraunces headings from globals.css, 8px chip text
 * from batch-history.css, a violet status chip, a plan banner whose heading
 * was dark maroon on dark maroon, and a nav rail that grew icons the approved
 * preview does not have.
 *
 * This is not a stylesheet fix. The shell was markup that exactly one page
 * had. It is a component now and every page mounts it, which is what makes
 * the one migrated cascade reach all of them.
 *
 * The workflow keeps its own copy of this markup because its sidebar is wired
 * to workflow state (the unsaved-work navigation guard, restart, the command
 * bar). The class names are identical, so both surfaces are drawn by the same
 * rules and neither needs an override of the other.
 * ==========================================================================*/
import { useEffect, useState } from "react";
import {readBatchHistory,preparedDaysFromHistory} from "./batch-history-read";
import SuiteBrand from "./suite-brand";
import { NavIcon, type NavKey as NavIconKey } from "./nav-icons";
import MobileGate from "./mobile-gate";
import { publishedDaysThisPeriod, type ListingGoal, type PublishedDay } from "./listing-goal";

export type NavKey = "home" | "hotlist" | "trademark" | "factory" | "batches" | "keywords" | "usage"
  | "connections" | "market-watch" | "shop-map" | "design-scanner" | "more";

/* D834 · Usage + Plan and Connections moved into the account menu, where the
   account itself already lives. The rail is the three places work happens. */
/*
  HOME FIRST, AND THE FACTORY IS NOT A PLACE INSIDE ITSELF.

  The first item used to read "Listing Factory" while you were standing in the
  Listing Factory, which is a link to where you already are. It is the button
  that starts a piece of work, so it says so.

  Sold Overnight has left this rail entirely. It is not part of making a
  listing; it lives on the home page with the other tools.
*/
/*
  D1575 · FOUR FEATURES WERE NOT IN THE PRODUCT.

  Market Watch, Shop Map, Design Scanner and the Trademark Checker rendered as
  bare centred columns on white — no rail, no topbar, no wordmark, no grid, no
  footer, and system fonts. Screenshotted side by side with the Listing
  Factory at 1440px they do not read as the same software, which is the
  "collection of separately built internal tools" this rail exists to prevent.

  It was also a dead end: with no rail on those pages there was no link back
  to anything. A member who opened Market Watch could reach the rest of the
  product only with the browser's back button.
*/
export const NAV: { key: NavKey; label: string; href: string; icon: NavIconKey; group: "work" | "library" }[] = [
  { key: "home", label: "Home", href: "/home", icon: "home", group: "work" },
  { key: "factory", label: "Listing Factory", href: "/listing-factory", icon: "listingFactory", group: "work" },
  { key: "market-watch", label: "Market Watch", href: "/market-watch", icon: "marketWatch", group: "work" },
  { key: "design-scanner", label: "Design Scanner", href: "/design-scanner", icon: "designScanner", group: "work" },
  { key: "shop-map", label: "Shop Map", href: "/shop-map", icon: "shopMap", group: "work" },
  { key: "trademark", label: "Trademark Checker", href: "/trademark", icon: "trademark", group: "work" },
  { key: "batches", label: "Batch History", href: "/batches", icon: "batches", group: "library" },
  { key: "keywords", label: "Keyword Banks", href: "/keywords", icon: "keywords", group: "library" },
  { key: "more", label: "Tools & settings", href: "/more", icon: "more", group: "library" },
];

/*
  THE DESKTOP GATE BELONGS TO THE LISTING FACTORY, NOT TO THE SHELL.

  `.app-shell > :not(.mobile-gate){display:none}` hides everything on a phone,
  which is right for a bulk publishing workspace and wrong for Design Scanner,
  whose whole reason to exist is a design in a camera roll. Shop Map is
  phone-first too. So the gate is a property of the page, not of the chrome,
  and a page that works on a phone keeps the global bottom bar instead.
*/
/*
  WHAT IS THE PRODUCT, AND WHAT IS THE LISTING FACTORY.

  The rail carries two different kinds of thing. The wordmark, the navigation,
  the account menu and the footer belong to the product as a whole — every
  feature should wear them, and that is the whole point of one shell. The
  wordmark does NOT: it is the Listing Factory's, and it appears only on the
  Listing Factory's pages. "Start a new batch", the
  listings counter and the prepared-listings goal belong to the Listing
  Factory alone.

  Mixing the two is what put a "198 / 10,000 listings" counter and a batch
  button on the Trademark Checker, and it is why the checker was taken out of
  the shell entirely rather than have the shell tell the truth about which
  half was which. So the shell says it now.
*/
const FACTORY_PAGES = new Set<NavKey>(["home", "factory", "batches", "keywords"]);

export default function FactoryShell({ active, title, desktopOnly = true, children }:
  { active: NavKey; title: string; desktopOnly?: boolean; children: React.ReactNode }) {
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const [goal, setGoal] = useState<ListingGoal | null>(null);
  const [goalDays, setGoalDays] = useState<PublishedDay[]>([]);
  const [goalDaysLoaded, setGoalDaysLoaded] = useState(false);
  const [goalDaysError,setGoalDaysError]=useState(false);
  const [account, setAccount] = useState<{ name: string; initials: string; signedIn: boolean } | null>(null);
  /* D835 · Every Etsy shop this seller has connected. The active one is the shop
     the product bank is scoped to; switching is a menu choice, not an OAuth
     round trip, because the token for each shop is already stored. */
  const [shops, setShops] = useState<{ shopId: number; shopName: string; active: boolean }[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const [switching, setSwitching] = useState(0);
  /* Whether the allowance could not be read, as distinct from not yet read. */
  const [usageFailed, setUsageFailed] = useState(false);

  useEffect(() => {
    /*
      D1659 · "LOADING USAGE…" FOREVER.

      A failed or unreadable /api/usage left this sentence on screen for the
      rest of the session: the catch swallowed the error and the success path
      needed both `plan` and `usage`, so anything else was indistinguishable
      from a request still in flight. Found in the state harness, where the
      sidebar sat on "Loading usage…" while everything else had rendered.

      Three states, like everywhere else in this product.
    */
    void (fetch("/api/usage").then(response => {
      if (!response.ok) throw new Error("usage");
      return response.json();
    }) as Promise<{ plan?: { drafts: number }; usage?: { drafts: number } }>)
      .then((result: { plan?: { drafts: number }; usage?: { drafts: number } }) => {
        if (result.plan && result.usage) {
          setUsage({ used: result.usage.drafts, limit: result.plan.drafts });
          setUsageFailed(false);
        } else setUsageFailed(true);
      }).catch(() => setUsageFailed(true));
    void (fetch("/api/seller-preferences").then(response => response.json()) as Promise<{ listingGoal?: ListingGoal }>).then((result: { listingGoal?: ListingGoal }) => {
      if (result.listingGoal?.enabled) setGoal(result.listingGoal);
    }).catch(() => undefined);
    void readBatchHistory().then(result=>{setGoalDays(preparedDaysFromHistory(result));setGoalDaysLoaded(true);setGoalDaysError(false)}).catch(()=>{setGoalDaysLoaded(false);setGoalDaysError(true)});
    void (fetch("/api/etsy").then(response => response.json()) as Promise<{ shops?: { shopId: number; shopName: string; active: boolean }[] }>).then((result: { shops?: { shopId: number; shopName: string; active: boolean }[] }) => {
      setShops(result.shops || []);
    }).catch(() => undefined);
    void (fetch("/api/account").then(response => response.json()) as Promise<{ signedIn?: boolean; name?: string; initials?: string }>).then((result: { signedIn?: boolean; name?: string; initials?: string }) => {
      setAccount({ signedIn: Boolean(result.signedIn), name: result.name || "", initials: result.initials || "" });
    }).catch(() => undefined);
  }, []);

  useEffect(()=>{const loaded=(event:Event)=>{const days=(event as CustomEvent<PublishedDay[]>).detail;if(Array.isArray(days)){setGoalDays(days);setGoalDaysLoaded(true);setGoalDaysError(false)}};window.addEventListener("goldie-history-loaded",loaded);return()=>window.removeEventListener("goldie-history-loaded",loaded)},[]);

  const goalDone = goal ? publishedDaysThisPeriod(goalDays, goal) : 0;

  /* D818 · the preview writes the allowance as "62 / 10,000 listings". Production
     printed the raw integer, so a five-figure plan read as one unbroken run of
     digits. Same number, the preview's formatting. */
  const usageLine = usage
    ? `${usage.used.toLocaleString()} / ${usage.limit.toLocaleString()} listings`
    /* "Allowance unavailable" describes the request, not the member's
       position. What they need to know is that the number is missing and
       that reopening the page is the fix. */
    : usageFailed ? "Couldn't load — reopen to retry"
    : "Loading usage…";

  return <main className={`app-shell interior-shell${desktopOnly ? "" : " responsive-shell"}`}>
    {/* D828 · the shell hides every child but this one on a phone. Without it
        these pages rendered as a blank screen. */}
    {desktopOnly && <MobileGate />}
    <header className="topbar">
      {/*
        NEUTRAL UNLESS THIS IS THE LISTING FACTORY.

        The umbrella name has not been chosen, so the shared rail carries no
        wordmark at all rather than a placeholder — a placeholder is how a
        temporary name becomes the real one. The topbar already names the page,
        so nothing is lost by the slot being empty.
      */}
      <div className="brand-lockup"><SuiteBrand /></div>
      <div className="top-actions">
        <nav className="top-nav" aria-label="Main navigation">
          <span className="suite-nav-label">Your tools</span>
          {NAV.filter(item => item.group === "work").map(item => <a key={item.key} className={item.key === active ? "active" : undefined}
            href={item.href} aria-current={item.key === active ? "page" : undefined}><NavIcon name={item.icon}/><span>{item.label}</span>{item.key === "market-watch" && <small>LIVE</small>}</a>)}
          <span className="suite-nav-label suite-nav-label-library">Library &amp; settings</span>
          {NAV.filter(item => item.group === "library").map(item => <a key={item.key} className={item.key === active ? "active" : undefined}
            href={item.href} aria-current={item.key === active ? "page" : undefined}><NavIcon name={item.icon}/><span>{item.label}</span></a>)}
        </nav>
        {/* D818 · on the workflow this is a button because it has to clear live
            batch state first. There is no batch to clear here, so the same
            control is the link it actually is. */}
        {/* Above the primary action, because that is the order of the morning:
            see what moved, then go and list. Styled quieter than Start a new
            batch so the money action keeps its weight. */}
        {active !== "factory" && <a className="workflow-restart-button" href="/listing-factory">
          <svg className="new-batch-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.3-6.4L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.3 6.4L3 16" /><path d="M3 21v-5h5" /></svg> Start a new batch</a>}
      </div>
      <div className="approved-sidebar-footer">
        {FACTORY_PAGES.has(active) && <a className="approved-usage" href="/usage"><b>Listings used</b><span>{usageLine}</span>
          <div className="approved-usage-track" aria-hidden="true"><i style={{ width: usage ? `${Math.min(100, usage.used / Math.max(1, usage.limit) * 100)}%` : "0%" }} /></div></a>}
        {/*
          A GOAL NOBODY EXPLAINS IS A NUMBER NOBODY TRUSTS.

          This read "This week's goal · 2 of 20 prepared". It never said who
          set 20 (the member did, in Goals), and "prepared" is this codebase's
          word, not a seller's — it means drafts built and ready to publish.
          Both are now on the card, in the member's language.
        */}
        {FACTORY_PAGES.has(active) && goal && <a className="listing-goal-side" href="/goals">
          <span className="listing-goal-caption">Your {goal.period}ly goal</span>
          <b>{goalDaysError?"Progress unavailable":goalDaysLoaded?`${goalDone} of ${goal.target} drafts ready`:"Loading progress…"}</b>
          <span className="listing-goal-note">{goalDaysError?"Try again shortly.":"You set this target in Goals."}</span>
          {goalDaysLoaded&&<span className="listing-goal-track" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.round((goalDone / Math.max(1, goal.target)) * 100))}%` }} /></span>}</a>}
        <small>&copy; 2026 Be A Wolf Biz</small>
        <p className="etsy-api-disclosure">The term &apos;Etsy&apos; is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.</p>
        {/* "Powered by Goldıe AI" stood here. The shared footer names no
            product until there is one to name. */}
      </div>
    </header>

    <div className="factory-main">
      <header className="factory-top">
        {/*
          THE PAGE NAMES ITSELF. IT DOES NOT NEED A PARENT.

          This read "Suite › Home". "Suite" is not a place a member can go, not
          a name the product uses, and not a level of anything — a breadcrumb
          trail of one invented ancestor. What is left is the only part that
          was ever true: which page you are on.
        */}
        <div className="factory-breadcrumb"><b className="factory-top-batch">{title}</b></div>
        <div className="factory-top-right">
          <div className="factory-account-wrap">
            <button type="button" className="factory-account" aria-haspopup="menu"
              aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>
              <span className="factory-avatar" aria-hidden="true">{account?.initials || "•"}</span>
              <span className="factory-account-label"><strong>{account?.name || "Your account"}</strong><small>Account</small></span>
              <span className="factory-account-caret" aria-hidden="true">&#8964;</span>
            </button>
            {menuOpen && <div className="factory-account-menu open" role="menu">
              {shops.length > 0 && <div className="factory-account-shops" role="group" aria-label="Etsy shop">
                <small>Etsy shop</small>
                {shops.map(shop => <button key={shop.shopId} type="button" role="menuitemradio" aria-checked={shop.active}
                  className={shop.active ? "is-active" : undefined} disabled={shop.active}
                  /* D836 · A failed switch used to reload anyway, so the seller
                     landed back on the same shop with no idea why. */
                  onClick={async () => {
                    setSwitchError(""); setSwitching(shop.shopId);
                    try {
                      const response = await fetch("/api/etsy/active", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shopId: shop.shopId }) });
                      const result = await response.json().catch(() => ({})) as { error?: string };
                      if (!response.ok) throw new Error(result.error || "That shop could not be opened.");
                      window.location.reload();
                    } catch (error) {
                      setSwitchError(error instanceof Error ? error.message : "That shop could not be opened.");
                      setSwitching(0);
                    }
                  }}>
                  {shop.shopName}{shop.active ? " ✓" : switching === shop.shopId ? " …" : ""}</button>)}
                {switchError && <small role="alert" className="factory-account-shop-error">{switchError}</small>}
              </div>}
              <a role="menuitem" href="/usage">Usage and limits</a>
              <a role="menuitem" href="/listing-factory?step=connect">Connections</a>
              {account && <a role="menuitem" href={account.signedIn
                ? "/account/sign-out?return_to=%2Flisting-factory"
                : "/account/sign-in?return_to=%2Flisting-factory"}>{account.signedIn ? "Sign out" : "Sign in"}</a>}
            </div>}
          </div>
        </div>
      </header>
      <div className="factory-work">{children}</div>
    </div>
  </main>;
}
