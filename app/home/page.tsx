import Link from "next/link";
import { accountSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import HomeStatus from "./home-status";

/**
 * THE FRONT DOOR, FOR THE PRODUCT AS IT NOW IS.
 *
 * Four features, not a growing shelf of tools. The previous version listed Hot
 * List and a "Customer Service" tile marked coming soon — neither is part of
 * Goldie, and a permanent coming-soon tile is a promise nobody made.
 *
 * Status lives above the doors and only appears when it says something. A
 * member with nothing pending sees four doors and no numbers, which is the
 * correct amount of information for that morning.
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

export default async function HomePage() {
  const user = await getChatGPTUser();
  if (!user)
    return <main className="hub-auth"><Link href={accountSignInPath("/home")}>Sign in</Link></main>;

  return <main className="hub">
    <header className="hub-head">
      {/* The suite mark. The Listing Factory lockup belongs inside the
          factory, not at the top of a page offering four products. */}
      <div className="hub-brand"><span className="suite-mark">Goldie</span></div>
      {/* No name. The only one available is the part of an email address
          before the @, and "Good to see you, shesawolfclothing" is worse than
          not trying. */}
      <h1>Good to see you</h1>
    </header>

    <HomeStatus />

    <p className="mini-label">YOUR TOOLS</p>
    <section className="hub-grid">
      {TOOLS.map(tool => (
        <Link key={tool.name} className="hub-tool" href={tool.href}>
          <span className="hub-icon" aria-hidden="true">{tool.icon}</span>
          <b>{tool.name}</b>
          <span className="hub-what">{tool.what}</span>
          {tool.desktopOnly && <span className="hub-desktop">Desktop</span>}
        </Link>
      ))}
    </section>

    <footer className="hub-foot">
      <p className="etsy-api-disclosure">
        The term &apos;Etsy&apos; is a trademark of Etsy, Inc. This application uses the
        Etsy API but is not endorsed or certified by Etsy, Inc.
      </p>
    </footer>
  </main>;
}
