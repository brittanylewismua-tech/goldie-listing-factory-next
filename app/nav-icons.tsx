/* D203 · Goldie had two navigations listing the same five destinations.
 *
 * listing-factory-app.tsx renders its own `.top-nav` with an icon beside every
 * label; management-nav.tsx renders `.management-nav` with bare text. They are
 * the same menu, so walking from Listing Factory to Batch History silently
 * swapped one sidebar for the other and every icon disappeared.
 *
 * Duplicating the markup into the second component would fix today's symptom
 * and leave the two free to drift again on the next change. The icons live here
 * instead, keyed by destination, and both navigations render from this map — so
 * an icon added or changed in one place is added or changed in both. */
export type NavKey = "listingFactory" | "batches" | "keywords" | "mockups" | "usage" | "operations";


/* D246 · D203 centralised the icon MARKUP so the two navigations could not
   drift, then left the PRESENTATION behind. Every rule that sized these was
   scoped to `.app-shell .top-nav svg` — the factory shell. The management
   pages render the same component inside `.management-nav`, which no rule
   touches, and they load a different CSS bundle entirely. With nothing sizing
   them, the SVGs fell back to filling their box: ~150px, solid black, sitting
   on top of the nav labels on Batch History, Keyword Banks, Mockup Library and
   Usage. An icon that depends on a stylesheet it does not ship with is not
   centralised, so the size and stroke ride on the element itself. */
const ICON = {
  viewBox: "0 0 24 24",
  width: 18,
  height: 18,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export function NavIcon({ name }: { name: NavKey }) {
  switch (name) {
    case "listingFactory":
      return <svg {...ICON}><path d="M3 9l1-4h16l1 4M3 9h18M3 9v10a1 1 0 001 1h16a1 1 0 001-1V9M9 13h6"/></svg>;
    case "batches":
      return <svg {...ICON}><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 106 5.3L3 8"/><path d="M12 7v5l3 2"/></svg>;
    case "keywords":
      return <svg {...ICON}><path d="M12 5a3 3 0 00-3 3 3 3 0 00-2 5.2A3 3 0 009 19a3 3 0 006 0 3 3 0 002-5.8A3 3 0 0015 8a3 3 0 00-3-3z"/><path d="M12 5v14"/></svg>;
    case "mockups":
      return <svg {...ICON}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-6 6"/></svg>;
    case "usage":
      return <svg {...ICON}><path d="M12 3l8 3.5v5c0 4.6-3.2 8.6-8 9.5-4.8-.9-8-4.9-8-9.5v-5L12 3z"/><path d="M9.2 12.2l1.9 1.9 3.9-3.9"/></svg>;
    case "operations":
      return <svg {...ICON}><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></svg>;
  }
}
