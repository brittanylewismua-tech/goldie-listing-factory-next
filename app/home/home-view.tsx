"use client";
import Link from "next/link";
import HomeStatus from "./home-status";

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
    href: "/listing-factory",
    name: "Listing Factory",
    what: "Turn a design into finished Etsy listings, in bulk.",
    desktopOnly: true,
    icon: <svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true">
      <path d="M3 20h18" /><path d="M5 20V9l5 3V9l5 3V6l4 3v11" /></svg>,
  },
  {
    href: "/market-watch",
    name: "Market Watch",
    what: "What is actually moving in the niches and shops you follow.",
    desktopOnly: false,
    icon: <svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true">
      <path d="M3 17l6-6 4 4 7-7" /><path d="M14 8h7v7" /></svg>,
  },
  {
    href: "/design-scanner",
    name: "Design Scanner",
    what: "See how a design compares with listings that are moving.",
    desktopOnly: false,
    icon: <svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true">
      <circle cx="12" cy="12" r="8" /><path d="M4 12h16" /></svg>,
  },
  {
    href: "/shop-map",
    name: "Shop Map",
    what: "Your own listings, your money, and what your shop is made of.",
    desktopOnly: false,
    icon: <svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>,
  },
  {
    href: "/trademark",
    name: "Trademark Checker",
    what: "Check a phrase before you print it.",
    desktopOnly: false,
    icon: <svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  },
];


export default function HomeView({ firstName = "Britt" }: { firstName?: string }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return <>
  <main className="hub p-grid home-dashboard">
    <header className="hub-head home-command-head home-dashboard-intro">
      <p className="home-dashboard-date"><span />{new Intl.DateTimeFormat("en-US", {
        weekday: "long", month: "long", day: "numeric",
      }).format(new Date())}</p>
      <h1>{greeting}, {firstName}.<br/><em>Your shop is moving.</em></h1>
      <p className="hub-intro">The clearest signals from your shop are ready.</p>
    </header>

    <HomeStatus />

    <div className="hub-section-head home-workspaces-head"><div><p className="mini-label">YOUR WORKSPACES</p><h2>Choose what you want to work on.</h2></div></div>
    <section className="hub-grid">
      {TOOLS.map(tool => (
        <Link key={tool.name} className="hub-tool" href={tool.href}>
          <span className="hub-icon" aria-hidden="true">{tool.icon}</span>
          <span className="hub-tool-number">0{TOOLS.indexOf(tool) + 1}</span>
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
