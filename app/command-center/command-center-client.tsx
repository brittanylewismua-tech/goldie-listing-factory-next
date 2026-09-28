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
  {href:"/hot-list",name:"Hot List",question:"What is selling across Etsy right now?",what:"Find listings gaining favorites or showing stock changes.",stat:null,icon:icon(<path d="m3 17 6-6 4 4 8-10"/>)},
  {href:"/platform-updates",name:"Etsy + Printify Updates",question:"What changed on Etsy or Printify?",what:"Read platform changes and the actions that affect your shop.",stat:null,icon:icon(<><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>)},
  {
    href: "/market-watch/research", name: "Research",
    question: "What are buyers choosing in my niche?",
    what: "Research niches, search Etsy, and follow shops and saved listings in one place.",
    /* D1864 · The summary already counted these and the tile threw them away. */
    stat: summary && (summary.keywords || summary.shops)
      ? [summary.keywords ? `${summary.keywords} keyword${summary.keywords === 1 ? "" : "s"}` : null,
         summary.shops ? `${summary.shops} shop${summary.shops === 1 ? "" : "s"} followed` : null]
        .filter(Boolean).join(" · ")
      : null,
    icon: icon(<><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6M7 10h6M10 7v6" /></>),
  },
  {
    href: "/shop-map", name: "Your shop",
    question: "Which of my designs actually make money?",
    what: "See which listings sold, compare product themes, and review revenue, Etsy fees, and production costs for your shop.",
    stat: summary && summary.sold90 > 0
      ? `${summary.sold90} units sold in the last 90 days`
      : summary && `${summary.mapped} listings mapped`,
    icon: icon(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></>),
  },
  {
    href: "/trademark", name: "Trademark Check",
    question: "Does this phrase have trademark matches?",
    what: "Find trademark matches and monitor the phrases you save.",
    stat: summary && summary.phrases > 0
      ? `${summary.phrases} phrase${summary.phrases === 1 ? "" : "s"} watched`
        + (summary.needReview ? ` · ${summary.needReview} to review` : "")
      : summary ? "Nothing watched yet" : null,
    icon: icon(<><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" /><path d="m9 12 2 2 4-4" /></>),
  },
];

export default function CommandCenterClient({embedded=false}:{embedded?:boolean}={}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  useEffect(() => {
    void fetch("/api/command-center/summary")
      .then(response => response.ok ? response.json() as Promise<Summary> : null)
      /* A figure that cannot be read is left off the card. It is never
         replaced with a zero, which would be a claim rather than a gap. */
      .then(body => setSummary(body)).catch(() => undefined);
  }, []);

  /*
    D1864 · HOME WAS SHOWING THE SIDEBAR TWICE.

    This grid links to the same five destinations as the rail standing beside
    it, and three of them already have their own section higher up the same
    page: Research is the largest block on Home, the platform update has its
    own card, and Your shop has the money card. So Home repeated itself, and
    three of the five tiles carried no figure to justify the repeat.

    Embedded on Home it now carries only the two tools Home does not already
    show. Nothing is hidden: all five live permanently in the rail, and the
    Command Center page itself still lists every one.
  */
  const onHomeAlready = new Set(["Research", "Your shop", "Etsy + Printify Updates"]);
  const tools = TOOLS(summary).filter(tool => !embedded || !onHomeAlready.has(tool.name));

  return <section className="cc-home p-grid">
    <header className="cc-home-head">
      {/* On Home the two tiles left are Hot List and Trademark Check, and
          neither is research. The kicker belongs to the full page. */}
      {embedded?null:<p className="mini-label">COMMAND CENTER</p>}
      {embedded?<h2>Command Center</h2>:<h1>Command Center</h1>}
      {!embedded&&<p className="cc-home-lede">Research your market, understand your shop, monitor platform changes, and check phrases before you use them.</p>}
    </header>

    <div className="cc-home-grid">
      {tools.map(tool => (
        <Link key={tool.name} className="cc-home-tile" data-tool={tool.name} href={tool.href}>
          <span className="cc-home-icon" aria-hidden="true">{tool.icon}</span>
          <div className="cc-directory-copy">{tool.question&&<strong className="cc-home-question">{tool.question}</strong>}<h2>{tool.name}</h2><p>{tool.what}</p></div>
          {tool.stat && <span className="cc-home-stat">{tool.stat}</span>}
          <i className="cc-home-go" aria-hidden="true">→</i>
        </Link>
      ))}
    </div>
  </section>;
}
