"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { NavIcon, type NavKey as NavIconKey } from "./nav-icons";

export type SuiteNavKey = "home" | "factory" | "batches" | "keywords" | "mockups" | "usage"
  | "market-watch" | "design-scanner" | "shop-map" | "trademark" | "connections";

export type SuiteNavItem = {
  key: SuiteNavKey;
  label: string;
  href: string;
  icon: NavIconKey;
  group: "home" | "factory" | "command" | "connections";
};

type Props = {
  active: string;
  items: SuiteNavItem[];
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
  keywordBankInNewTab?: boolean;
};

const FACTORY_KEYS = new Set(["factory", "batches", "keywords", "mockups", "usage"]);
const COMMAND_KEYS = new Set(["market-watch", "design-scanner", "shop-map", "trademark"]);

function LockIcon() {
  return <svg className="suite-nav-lock" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="5.5" y="10" width="13" height="10" rx="2" />
    <path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10" />
  </svg>;
}

export default function SuiteSidebarNav({ active, items, onNavigate,
  keywordBankInNewTab = false }: Props) {
  const [factoryOpen, setFactoryOpen] = useState(FACTORY_KEYS.has(active));
  const [commandOpen, setCommandOpen] = useState(COMMAND_KEYS.has(active));
  const [commandCenterAccess, setCommandCenterAccess] = useState<boolean|null>(null);
  const [lockedTool, setLockedTool] = useState("");

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
  const command = items.filter(item => item.group === "command");
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
    return <a key={item.key} href={item.href}
      className={`${item.key === active ? "active" : ""}${child ? " suite-nav-child" : ""}${locked ? " locked" : ""}`.trim()}
      aria-current={item.key === active ? "page" : undefined}
      aria-label={locked ? `${item.label}, Full Suite membership required` : undefined}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noopener noreferrer" : undefined}
      onClick={event => navigate(event, item)}>
      <NavIcon name={item.icon}/><span>{item.label}</span>
      {item.key === "market-watch" && <small>LIVE</small>}
      {locked && <LockIcon/>}
    </a>;
  };

  return <>
    <nav className="top-nav suite-sidebar-nav" aria-label="Product navigation">
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
          <button type="button" className="suite-nav-heading" aria-expanded={commandOpen}
            onClick={() => setCommandOpen(open => !open)}>
            <NavIcon name="marketWatch"/><span>Command Center</span>
          </button>
        </div>
        {commandOpen && <div className="suite-nav-children">{command.map(item => link(item, true))}</div>}
      </div>
      {connections && link(connections)}
    </nav>

    {lockedTool && <div className="suite-access-backdrop" role="presentation"
      onMouseDown={event => { if (event.target === event.currentTarget) setLockedTool(""); }}>
      <section className="suite-access-dialog" role="dialog" aria-modal="true" aria-labelledby="suite-access-title">
        <button className="suite-access-close" type="button" aria-label="Close" onClick={() => setLockedTool("")}>×</button>
        <span className="suite-access-lock"><LockIcon/></span>
        <h2 id="suite-access-title">Join the membership to access {lockedTool}.</h2>
        <p>Command Center tools are included with the $47/month membership.</p>
        <div className="suite-access-actions">
          <button type="button" onClick={() => setLockedTool("")}>Not now</button>
          <a href="/usage">See the membership</a>
        </div>
      </section>
    </div>}
  </>;
}
