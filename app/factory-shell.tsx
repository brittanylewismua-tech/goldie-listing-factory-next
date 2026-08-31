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
import GoldieWordmark from "./goldie-wordmark";
import MobileGate from "./mobile-gate";
import { publishedDaysThisPeriod, type ListingGoal, type PublishedDay } from "./listing-goal";

type NavKey = "factory" | "batches" | "keywords" | "usage" | "connections";

/* D834 · Usage + Plan and Connections moved into the account menu, where the
   account itself already lives. The rail is the three places work happens. */
const NAV: { key: NavKey; label: string; href: string }[] = [
  { key: "factory", label: "Listing Factory", href: "/listing-factory" },
  { key: "batches", label: "Batch History", href: "/batches" },
  { key: "keywords", label: "Keyword Banks", href: "/keywords" },
];

export default function FactoryShell({ active, title, children }:
  { active: NavKey; title: string; children: React.ReactNode }) {
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const [goal, setGoal] = useState<ListingGoal | null>(null);
  const [goalDays, setGoalDays] = useState<PublishedDay[]>([]);
  const [account, setAccount] = useState<{ name: string; initials: string; signedIn: boolean } | null>(null);
  /* D835 · Every Etsy shop this seller has connected. The active one is the shop
     the product bank is scoped to; switching is a menu choice, not an OAuth
     round trip, because the token for each shop is already stored. */
  const [shops, setShops] = useState<{ shopId: number; shopName: string; active: boolean }[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    void fetch("/api/usage").then(response => response.json()).then((result: { plan?: { drafts: number }; usage?: { drafts: number } }) => {
      if (result.plan && result.usage) setUsage({ used: result.usage.drafts, limit: result.plan.drafts });
    }).catch(() => undefined);
    void fetch("/api/seller-preferences").then(response => response.json()).then((result: { listingGoal?: ListingGoal }) => {
      if (result.listingGoal?.enabled) setGoal(result.listingGoal);
    }).catch(() => undefined);
    void fetch("/api/batches").then(response => response.json()).then((result: { published?: PublishedDay[] }) => {
      setGoalDays(result.published || []);
    }).catch(() => undefined);
    void fetch("/api/etsy").then(response => response.json()).then((result: { shops?: { shopId: number; shopName: string; active: boolean }[] }) => {
      setShops(result.shops || []);
    }).catch(() => undefined);
    void fetch("/api/account").then(response => response.json()).then((result: { signedIn?: boolean; name?: string; initials?: string }) => {
      setAccount({ signedIn: Boolean(result.signedIn), name: result.name || "", initials: result.initials || "" });
    }).catch(() => undefined);
  }, []);

  const goalDone = goal ? publishedDaysThisPeriod(goalDays, goal) : 0;

  /* D818 · the preview writes the allowance as "62 / 10,000 listings". Production
     printed the raw integer, so a five-figure plan read as one unbroken run of
     digits. Same number, the preview's formatting. */
  const usageLine = usage
    ? `${usage.used.toLocaleString()} / ${usage.limit.toLocaleString()} listings`
    : "Loading usage…";

  return <main className="app-shell interior-shell">
    {/* D828 · the shell hides every child but this one on a phone. Without it
        these pages rendered as a blank screen. */}
    <MobileGate />
    <header className="topbar">
      <div className="brand-lockup"><GoldieWordmark className="approved-brand" /></div>
      <div className="top-actions">
        <nav className="top-nav" aria-label="Goldie navigation">
          {NAV.map(item => <a key={item.key} className={item.key === active ? "active" : undefined}
            href={item.href} aria-current={item.key === active ? "page" : undefined}>{item.label}</a>)}
        </nav>
        {/* D818 · on the workflow this is a button because it has to clear live
            batch state first. There is no batch to clear here, so the same
            control is the link it actually is. */}
        <a className="workflow-restart-button" href="/listing-factory">
          <svg className="new-batch-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.3-6.4L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.3 6.4L3 16" /><path d="M3 21v-5h5" /></svg> Start a new batch</a>
      </div>
      <div className="approved-sidebar-footer">
        <a className="approved-usage" href="/usage"><b>Usage + Plan</b><span>{usageLine}</span>
          <div className="approved-usage-track" aria-hidden="true"><i style={{ width: usage ? `${Math.min(100, usage.used / Math.max(1, usage.limit) * 100)}%` : "0%" }} /></div></a>
        {goal && <a className="listing-goal-side" href="/goals">
          <span className="listing-goal-caption">This {goal.period}&rsquo;s goal</span>
          <b>{goalDone} of {goal.target} published</b>
          <span className="listing-goal-track" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.round((goalDone / Math.max(1, goal.target)) * 100))}%` }} /></span></a>}
        <small>&copy; 2026 Be A Wolf Biz</small>
        <p className="etsy-api-disclosure">The term &apos;Etsy&apos; is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.</p>
        <div className="approved-powered"><span>Powered by</span><b>Gold<span className="approved-footer-i">&#305;<i>&#10022;</i></span>e AI</b></div>
      </div>
    </header>

    <div className="factory-main">
      <header className="factory-top">
        <b className="factory-top-batch">{title}</b>
        <div className="factory-top-right">
          <div className="factory-account-wrap">
            <button type="button" className="factory-account" aria-haspopup="menu"
              aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>
              <span className="factory-avatar" aria-hidden="true">{account?.initials || "•"}</span>
              <span className="factory-account-label"><strong>{account?.name || "Your account"}</strong><small>Account</small></span>
              <span className="factory-account-caret" aria-hidden="true">&#8964;</span>
            </button>
            {menuOpen && <div className="factory-account-menu open" role="menu">
              {shops.length > 1 && <div className="factory-account-shops" role="group" aria-label="Etsy shop">
                <small>Etsy shop</small>
                {shops.map(shop => <button key={shop.shopId} type="button" role="menuitemradio" aria-checked={shop.active}
                  className={shop.active ? "is-active" : undefined} disabled={shop.active}
                  onClick={() => { void fetch("/api/etsy/active", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shopId: shop.shopId }) }).then(() => window.location.reload()); }}>
                  {shop.shopName}{shop.active ? " ✓" : ""}</button>)}
              </div>}
              <a role="menuitem" href="/usage">Usage + Plan</a>
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
