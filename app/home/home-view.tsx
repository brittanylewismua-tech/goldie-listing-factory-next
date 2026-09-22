"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * THE HOME PAGE'S CONTENT, MOUNTABLE ON ITS OWN.
 *
 * Split out of the route so the state preview can render the real page —
 * markup, stylesheets and all — against fixtures. A page only the production
 * server can draw is a page nobody can check at a phone width without a
 * member's session.
 */
const stroke = {
  fill: "none", stroke: "currentColor", strokeWidth: 1.6,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

const TOOLS = [
  {
    href: "/market-watch",
    name: "Market Watch",
    what: "Compare Etsy listings for your keywords and watched shops.",
    desktopOnly: false,
    icon: <svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true">
      <path d="M3 17l6-6 4 4 7-7" /><path d="M14 8h7v7" /></svg>,
  },
  {
    href: "/design-scanner",
    name: "Design Scanner",
    what: "Check a design before you build the listing.",
    desktopOnly: false,
    icon: <svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true">
      <circle cx="12" cy="12" r="8" /><path d="M4 12h16" /></svg>,
  },
  {
    href: "/shop-map",
    name: "Shop Map",
    what: "See sold listings, product themes, and your numbers.",
    desktopOnly: false,
    icon: <svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>,
  },
  {
    href: "/trademark",
    name: "Trademark Tracker",
    what: "Check a phrase and keep an eye on it.",
    desktopOnly: false,
    icon: <svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  },
];


export default function HomeView() {
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => setToday(new Date()), []);
  const greeting = !today ? "Welcome back" : today.getHours() < 12
    ? "Good morning" : today.getHours() < 17 ? "Good afternoon" : "Good evening";
  return <>
  <main className="hub p-grid home-dashboard">
    <header className="hub-head home-command-head home-dashboard-intro">
      {today && <p className="home-dashboard-date"><span />{new Intl.DateTimeFormat("en-US", {
        weekday: "long", month: "long", day: "numeric",
      }).format(today)}</p>}
      <h1>{greeting}.</h1>
      <p className="hub-intro">What do you want to work on?</p>
    </header>

    <section className="home-primary-actions" aria-label="Quick actions">
      <Link className="home-primary-action" href="/listing-factory?step=setup"><span>LISTING FACTORY</span><strong>Create a listing or batch</strong><p>Turn your artwork into ready-to-review Etsy drafts.</p><i aria-hidden="true">→</i></Link>
      <Link className="home-secondary-action" href="/batches"><span>BATCH HISTORY</span><strong>Continue your work</strong><p>Return to your saved batches and listing drafts.</p><i aria-hidden="true">→</i></Link>
    </section>

    <div className="hub-section-head home-workspaces-head"><div><h2>Command Center</h2><p>Research, refine, and manage your shop.</p></div></div>
    <section className="hub-grid">
      {TOOLS.map((tool) => (
        <Link key={tool.name} className="hub-tool" href={tool.href}>
          <span className="hub-icon" aria-hidden="true">{tool.icon}</span>
          <b>{tool.name}</b>
          <span className="hub-what">{tool.what}</span>
          {/* "Desktop" told a member nothing. This is a bulk publishing
              workspace and it needs a computer; that is what the chip says. */}
          {tool.desktopOnly && <span className="hub-desktop">Needs a computer</span>}
          <span className="hub-open" aria-hidden="true">↗</span>
        </Link>
      ))}
    </section>

    <footer className="hub-foot">
      <p className="etsy-api-disclosure">
        The term &apos;Etsy&apos; is a trademark of Etsy, Inc. This application uses the
        Etsy API but is not endorsed or certified by Etsy, Inc.
      </p>
    </footer>
  </main>
  </>;
}
