import Link from "next/link";
import { accountSignInPath, getChatGPTUser } from "@/app/chatgpt-auth";
import GoldieWordmark from "../goldie-wordmark";

/**
 * THE FRONT DOOR.
 *
 * The Listing Factory used to be the whole product, so its sidebar was the
 * only navigation and anything new had to be wedged into it — which is how
 * Sold Overnight ended up sitting between Batch History and Keyword Banks,
 * next to a link called "Listing Factory" that you could only click while
 * already standing in the Listing Factory.
 *
 * The Factory is one tool among several now. This is the place they live, and
 * each one gets a door rather than a rail entry.
 *
 * TOOLS THAT DO NOT EXIST YET ARE SHOWN AND MARKED. Hiding them would make the
 * page look finished and leave no sense of what is coming; making them look
 * live would be a lie you find out about by clicking. They are visibly not
 * ready and they are not clickable.
 */

type Tool = {
  href: string | null;
  name: string;
  what: string;
  icon: React.ReactNode;
};

const stroke = {
  fill: "none", stroke: "currentColor", strokeWidth: 1.6,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

const TOOLS: Tool[] = [
  {
    href: "/listing-factory",
    name: "Listing Factory",
    what: "Turn a design into finished Etsy listings, in bulk.",
    icon: <svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true">
      <path d="M3 20h18" /><path d="M5 20V9l5 3V9l5 3V6l4 3v11" /></svg>,
  },
  {
    href: "/hot-list",
    name: "Hot List",
    what: "What is actually selling on Etsy right now, by product.",
    icon: <svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true">
      <path d="M3 17l6-6 4 4 7-7" /><path d="M14 8h7v7" /></svg>,
  },
  {
    href: null,
    name: "Trademark Search",
    what: "Check a phrase before you print it.",
    icon: <svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  },
  {
    href: null,
    name: "Customer Service",
    what: "Answer buyer messages in your own voice.",
    icon: <svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true">
      <path d="M21 12a8 8 0 1 1-3.1-6.3" /><path d="M21 5v4h-4" /><path d="M8 12h.01M12 12h.01M16 12h.01" /></svg>,
  },
];

export default async function HomePage() {
  const user = await getChatGPTUser();
  if (!user)
    return <main className="hub-auth"><Link href={accountSignInPath("/home")}>Sign in</Link></main>;

  return <main className="hub">
    <header className="hub-head">
      <div className="hub-brand"><GoldieWordmark className="approved-brand" /></div>
      <p className="mini-label">YOUR TOOLS</p>
      {/* No name. The only one available is the part of an email address
          before the @, and "Good to see you, shesawolfclothing" is worse than
          not trying. */}
      <h1>Good to see you</h1>
    </header>

    <section className="hub-grid">
      {TOOLS.map(tool => {
        const inside = <>
          <span className="hub-icon" aria-hidden="true">{tool.icon}</span>
          <b>{tool.name}</b>
          <span className="hub-what">{tool.what}</span>
          {!tool.href && <span className="hub-soon">Coming soon</span>}
        </>;
        return tool.href
          ? <Link key={tool.name} className="hub-tool" href={tool.href}>{inside}</Link>
          : <div key={tool.name} className="hub-tool soon" aria-disabled="true">{inside}</div>;
      })}
    </section>

    <footer className="hub-foot">
      <p className="etsy-api-disclosure">
        The term &apos;Etsy&apos; is a trademark of Etsy, Inc. This application uses the
        Etsy API but is not endorsed or certified by Etsy, Inc.
      </p>
    </footer>
  </main>;
}
