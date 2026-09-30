"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { NavIcon, type NavKey as NavIconKey } from "./nav-icons";

export type SuiteNavKey = "home" | "factory" | "batches" | "keywords" | "mockups" | "usage" | "goals" | "command-center"
  | "platform-updates" | "niche-research" | "market-watch" | "design-scanner" | "shop-map" | "trademark" | "connections";

export type SuiteNavItem = {
  key: SuiteNavKey;
  label: string;
  href: string;
  icon: NavIconKey;
  group: "home" | "factory" | "command" | "connections";
};

type Props = {
  active: string;
  current?: boolean;
  items: SuiteNavItem[];
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
  keywordBankInNewTab?: boolean;
};

const FACTORY_KEYS = new Set(["factory", "batches", "keywords", "mockups", "usage", "goals"]);
const COMMAND_KEYS = new Set(["command-center", "platform-updates", "niche-research", "market-watch", "design-scanner", "shop-map", "trademark"]);

function LockIcon() {
  return <svg className="suite-nav-lock" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="5.5" y="10" width="13" height="10" rx="2" />
    <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
  </svg>;
}

export default function SuiteSidebarNav({ active, items, onNavigate,
  keywordBankInNewTab = false, current = false }: Props) {
  /*
    BOTH GROUPS OPEN ON ARRIVAL.

    These used to open only when you were already standing inside them, so on
    Home - the page every session starts on - the rail showed three collapsed
    words and nothing else. A member who had never opened Listing Factory had
    no way to learn from the rail that Batch History, Keyword Banks, Mockup
    Sets and Usage exist at all; the navigation hid the product from the
    people who most needed to see it. The approved design shows both groups
    expanded, which is also what the collapse control is for: closing a group
    is a choice the member makes, not the state they inherit.
  */
  const [factoryOpen, setFactoryOpen] = useState(true);
  const [commandOpen, setCommandOpen] = useState(true);
  const [commandCenterAccess, setCommandCenterAccess] = useState<boolean|null>(null);
  const [lockedTool, setLockedTool] = useState("");
  const [watchTab,setWatchTab]=useState("");
  useEffect(()=>{setWatchTab(new URLSearchParams(window.location.search).get("tab")??"");},[]);

  useEffect(() => {
    let alive = true;
    void fetch("/api/access/status").then(response => response.ok ? response.json() as Promise<{commandCenter?:boolean}> : null)
      .then((result: { commandCenter?: boolean } | null) => {
        if (alive) setCommandCenterAccess(result?Boolean(result.commandCenter):null);
      }).catch(() => { if (alive) setCommandCenterAccess(null); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!lockedTool) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLockedTool("");
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [lockedTool]);

  const home = items.find(item => item.group === "home");
  const factory = items.find(item => item.key === "factory");
  const factoryChildren = items.filter(item => item.group === "factory" && item.key !== "factory");
  const command = items.filter(item => item.group === "command" && item.key !== "market-watch");
  const connections = items.find(item => item.group === "connections");
  const navigate = (event: MouseEvent<HTMLAnchorElement>, item: SuiteNavItem) => {
    if (item.group === "command" && commandCenterAccess === false) {
      event.preventDefault();
      setLockedTool(item.label);
      return;
    }
    onNavigate?.(event, item.href);
  };

  const link = (item: SuiteNavItem, child = false) => {
    const newTab = keywordBankInNewTab && item.key === "keywords";
    const locked = item.group === "command" && commandCenterAccess === false;
    const selected=item.key===active || (current&&item.key==="niche-research"&&active==="market-watch");
    return <Link key={item.key} href={item.href}
      className={`${selected ? "active" : ""}${child ? " suite-nav-child" : ""}${locked ? " locked" : ""}`.trim()}
      aria-current={selected ? "page" : undefined}
      aria-label={locked ? `${item.label}, Full Suite membership required` : undefined}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noopener noreferrer" : undefined}
      onClick={event => navigate(event, item)}>
      {current&&item.key==='niche-research'?<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>:<NavIcon name={item.icon}/>}<span>{item.label}</span>
      {item.key === "market-watch" && <small>LIVE</small>}
      {locked && <LockIcon/>}
    </Link>;
  };

  return <>
    {current ? <nav className="current-navigation" aria-label="Product navigation">
      {home&&link(home)}
      <section className="current-nav-group" aria-label="Command Center">
        <span className="current-nav-group-label">Command Center</span>
        {['niche-research','shop-map','trademark','platform-updates'].map(key=>items.find(i=>i.key===key)).filter((i):i is SuiteNavItem=>Boolean(i)).map(i=>link(i))}
        <Link href="/hot-list" className={active==="hotlist"?"active":undefined} aria-current={active==="hotlist"?"page":undefined}><NavIcon name="marketWatch"/><span>Hot List</span></Link>
      </section>
      <section className="current-factory-section" aria-label="Listing Factory">{factory&&link(factory)}{FACTORY_KEYS.has(active)&&<div className="current-factory-children">{factoryChildren.map(i=>link(i))}<Link href="/goals" className={active === "goals" ? "active" : undefined} aria-current={active === "goals" ? "page" : undefined}><NavIcon name="goals"/><span>Listing goals</span></Link></div>}</section>
      <details className="current-more"><summary>Settings<svg className="current-more-chevron" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg></summary><div className="current-nav-group" role="group" aria-label="Shop setup"><span className="current-nav-group-label">Shop setup</span>{connections&&link(connections)}</div></details>
    </nav> : <nav className="top-nav suite-sidebar-nav" aria-label="Product navigation">
      {home && link(home)}
      {factory && <div className={`suite-nav-section${FACTORY_KEYS.has(active) ? " current" : ""}`}>
        <div className="suite-nav-parent">
          <button type="button" className="suite-nav-toggle" aria-label={`${factoryOpen ? "Collapse" : "Expand"} Listing Factory menu`}
            aria-expanded={factoryOpen} onClick={() => setFactoryOpen(open => !open)}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg>
          </button>
          {link(factory)}
        </div>
        {factoryOpen && <div className="suite-nav-children">{factoryChildren.map(item => link(item, true))}</div>}
      </div>}
      <div className={`suite-nav-section${COMMAND_KEYS.has(active) ? " current" : ""}`}>
        <div className="suite-nav-parent suite-nav-command-parent">
          <button type="button" className="suite-nav-toggle" aria-label={`${commandOpen ? "Collapse" : "Expand"} Command Center menu`}
            aria-expanded={commandOpen} onClick={() => setCommandOpen(open => !open)}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg>
          </button>
          {/*
            D1786 · The group heading was a button that only opened a list.
            Clicking the name of the half of the product that costs forty-seven
            dollars a month did nothing but reveal four links, which is what
            made four tools read as a menu. It is a page now; the chevron
            beside it still opens and closes the list.
          */}
          <Link className={`suite-nav-heading${active === "command-center" ? " active" : ""}`}
            href="/command-center" aria-current={active === "command-center" ? "page" : undefined}
            onClick={event => onNavigate?.(event, "/command-center")}>
            <NavIcon name="marketWatch"/><span>Command Center</span>
          </Link>
        </div>
        {commandOpen && <div className="suite-nav-children">{command.map(item => link(item, true))}</div>}
      </div>
      {connections && link(connections)}
    </nav>}

    {lockedTool && <div className="suite-access-backdrop" role="presentation"
      onMouseDown={event => { if (event.target === event.currentTarget) setLockedTool(""); }}>
      <section className="suite-access-dialog" role="dialog" aria-modal="true" aria-labelledby="suite-access-title">
        <button className="suite-access-close" type="button" aria-label="Close" onClick={() => setLockedTool("")}>×</button>
        <span className="suite-access-lock"><LockIcon/></span>
        <h2 id="suite-access-title">Join the membership to access {lockedTool}.</h2>
        <p>Command Center tools are included with the $47/month membership.</p>
        <div className="suite-access-actions">
          <button type="button" onClick={() => setLockedTool("")}>Not now</button>
          <Link href="/usage">See the membership</Link>
        </div>
      </section>
    </div>}
  </>;
}
