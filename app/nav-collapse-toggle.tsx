"use client";
import { useEffect, useState } from "react";

/* D710 · Collapsing the navigation is what pays for the rail: 288px of chrome
   becomes 76px, and the work column gets the difference. Her earlier note was
   that the control itself was the problem, not the idea - it was a 24px circle
   pinned to the sidebar's outer edge, so half of it sat behind the sidebar and
   it read as an artefact rather than a button. It lives inside the rail now and
   looks like the icons it sits with.
   The choice is remembered, because a seller who collapses it once means it. */
const KEY = "goldie-nav-collapsed";

export default function NavCollapseToggle() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem(KEY) === "1") setCollapsed(true); } catch { /* private mode */ }
  }, []);
  useEffect(() => {
    document.body.classList.toggle("nav-collapsed", collapsed);
    try { localStorage.setItem(KEY, collapsed ? "1" : "0"); } catch { /* private mode */ }
  }, [collapsed]);
  return (
    <button
      type="button"
      className="nav-collapse-toggle"
      aria-label={collapsed ? "Expand menu" : "Collapse menu"}
      title={collapsed ? "Expand menu" : "Collapse menu"}
      aria-pressed={collapsed}
      onClick={() => setCollapsed(value => !value)}
    >{collapsed ? "»" : "«"}</button>
  );
}
