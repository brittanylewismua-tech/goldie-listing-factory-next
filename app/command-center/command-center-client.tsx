"use client";
/* ============================================================================
 * THE COMMAND CENTER HAS A PAGE NOW.
 *
 * It was four links inside a collapsible group in the sidebar. Four links is a
 * menu, and a menu cannot carry a price, because a menu has done nothing by
 * the time you look at it. Every tool that charges what this charges opens on
 * work already done: what is being watched, what moved, what needs a look.
 *
 * So the page leads with the standing state - real counts, from our own
 * database, no Etsy calls, because a landing page that spends the shared
 * allowance to draw itself would be the most expensive page in the product and
 * the least useful. Then each tool is presented by the question it answers
 * rather than by its name, because "Market Watch" tells a seller nothing and
 * "what is actually selling in this search" tells them everything.
 * ==========================================================================*/
import Link from "next/link";
import { useEffect, useState } from "react";

type Summary = {
  keywords: number; shops: number; phrases: number;
  needReview: number; mapped: number; sold90: number;
};

const stroke = {
  fill: "none", stroke: "currentColor", strokeWidth: 1.6,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};
const icon = (children: React.ReactNode) =>
  <svg viewBox="0 0 24 24" width="26" height="26" {...stroke} aria-hidden="true">{children}</svg>;

/* The question first. The name of the tool is how we file it, not what it is
   for, and a member paying monthly is buying the answer rather than the file. */
const TOOLS = (summary: Summary | null) => [
  {
    href: "/market-watch", name: "Market Watch",
    question: "What is actually selling in this search?",
    what: "Reads up to a thousand live listings for a phrase and ranks them by favorites, "
      + "views and favorites per day — orderings Etsy will not give anyone — then describes "
      + "what the top fifty have in common: the price band, the age, how many take a "
      + "personalisation, and the words that keep recurring in their titles.",
    stat: summary && `${summary.keywords} keyword${summary.keywords === 1 ? "" : "s"} and `
      + `${summary.shops} shop${summary.shops === 1 ? "" : "s"} followed`,
    icon: icon(<><path d="M3 17l6-6 4 4 7-7" /><path d="M14 8h7v7" /></>),
  },
  {
    href: "/design-scanner", name: "Design Scanner",
    question: "Is this listing ready to publish?",
    what: "Measures a draft against the fifty most favorited live listings for its search: "
      + "whether the price sits in their band, which of their recurring words it is missing, "
      + "how many tag slots are empty, and whether a tag is too long for Etsy to save. "
      + "Then compares the artwork itself against what buyers are responding to.",
    stat: "Answers in about four seconds",
    icon: icon(<><circle cx="12" cy="12" r="8" /><path d="M4 12h16" /></>),
  },
  {
    href: "/shop-map", name: "Shop Map",
    question: "Which of my designs actually make money?",
    what: "Your own receipts joined to your own Printify costs and Etsy's own fees — "
      + "revenue, production, refunds and adjustments to the cent, grouped by the themes "
      + "you sell into. Etsy does not know what Printify charged you. Printify does not "
      + "know what Etsy took. This is the only place both are.",
    stat: summary && summary.sold90 > 0
      ? `${summary.sold90} units sold in the last 90 days`
      : summary && `${summary.mapped} listings mapped`,
    icon: icon(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>),
  },
  {
    href: "/trademark", name: "Trademark Tracker",
    question: "Can I legally print this phrase?",
    what: "Checks a phrase against the federal register before you put it on a garment, "
      + "and keeps watching the ones you save, because an application filed after you "
      + "checked is the one that costs you the listing.",
    stat: summary && summary.phrases > 0
      ? `${summary.phrases} phrase${summary.phrases === 1 ? "" : "s"} watched`
        + (summary.needReview ? ` · ${summary.needReview} to review` : "")
      : "Nothing watched yet",
    icon: icon(<><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" /><path d="m9 12 2 2 4-4" /></>),
  },
];

export default function CommandCenterClient() {
  const [summary, setSummary] = useState<Summary | null>(null);
  useEffect(() => {
    void fetch("/api/command-center/summary")
      .then(response => response.ok ? response.json() as Promise<Summary> : null)
      /* A figure that cannot be read is left off the card. It is never
         replaced with a zero, which would be a claim rather than a gap. */
      .then(body => setSummary(body)).catch(() => undefined);
  }, []);

  return <main className="cc-home p-grid">
    <header className="cc-home-head">
      <p className="mini-label">COMMAND CENTER</p>
      <h1>Everything except making the listing.</h1>
      <p className="cc-home-lede">Four tools that answer four questions, from Etsy&apos;s own
        data and your own books. The Listing Factory builds the listing; this is how you
        decide what to build, what to charge, and whether it earned anything.</p>
    </header>

    <div className="cc-home-grid">
      {TOOLS(summary).map(tool => (
        <Link key={tool.name} className="cc-home-tile" href={tool.href}>
          <span className="cc-home-icon" aria-hidden="true">{tool.icon}</span>
          <span className="cc-home-name">{tool.name}</span>
          <h2>{tool.question}</h2>
          <p>{tool.what}</p>
          {tool.stat && <span className="cc-home-stat">{tool.stat}</span>}
          <i className="cc-home-go" aria-hidden="true">→</i>
        </Link>
      ))}
    </div>
  </main>;
}
