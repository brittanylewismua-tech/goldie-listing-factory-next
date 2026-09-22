import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postcss from "postcss";

/* D1764-D1768 · The approved shell, pinned.

   Every one of these is a defect that shipped and was found by opening the
   deployed page, not by a test - which is the reason to write the test. */

const read = name => readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8");
const sheet = read("suite-shell-2026.css");
const root = postcss.parse(sheet);

const rulesIn = (query) => {
  const found = [];
  root.walkAtRules("media", at => {
    if (!at.params.includes(query)) return;
    at.walkRules(rule => found.push(rule));
  });
  return found;
};
const declOf = (rules, selector, prop) => {
  for (const rule of rules) {
    if (!rule.selectors.some(sel => sel.includes(selector))) continue;
    for (const decl of rule.nodes ?? []) if (decl.prop === prop) return decl.value;
  }
  return null;
};

test("the group label is not squeezed into the chevron's column", () => {
  /* suite-redesign.css lays the parent row out as `28px minmax(0,1fr)`. The
     override has to carry the same `>.topbar` depth or the grid wins and
     "Listing Factory" renders as a bare icon, which is what it did. */
  assert.match(sheet, /\.app-shell>\.topbar \.suite-nav-parent\{[^}]*display:flex/);
  assert.match(sheet, /\.app-shell>\.topbar \.suite-nav-parent\{[^}]*grid-template-columns:none/);
  assert.match(sheet, /\.app-shell>\.topbar \.suite-nav-toggle\{[^}]*position:absolute/);
});

test("the home grid column cannot grow past the page", () => {
  /* An implicit grid column is sized auto and will not shrink below the
     min-content width of four tiles standing side by side; at 1440 the cards
     ran roughly 300px off the right edge, clipped and unreachable. */
  assert.match(sheet, /\.home-dashboard\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(sheet, /\.home-panel-tiles-four\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}/);
});

test("the search overlay is not stretched by its own flex container", () => {
  assert.match(sheet, /\.suite-search-backdrop\{[^}]*align-items:flex-start/);
});

test("the search panel escapes the top bar's backdrop-filter", () => {
  /* An element with a backdrop-filter is the containing block for fixed
     descendants, so the overlay opened as a strip inside the top bar. */
  const search = read("suite-search.tsx");
  assert.match(search, /createPortal\(panel, document\.body\)/);
  assert.match(sheet, /\.suite-search-backdrop\{[^}]*position:fixed/);
});

test("search says what it searches, and searches it", () => {
  const search = read("suite-search.tsx");
  /* "Search anything" is a promise this cannot keep: it resolves pages,
     tools and saved batches, and the field says so. */
  assert.doesNotMatch(search, /Search anything/);
  assert.match(search, /Search pages, tools and batches/);
  assert.match(search, /readBatchHistory/);
});

test("both rail groups are open on arrival", () => {
  const nav = read("suite-sidebar-nav.tsx");
  assert.match(nav, /const \[factoryOpen, setFactoryOpen\] = useState\(true\)/);
  assert.match(nav, /const \[commandOpen, setCommandOpen\] = useState\(true\)/);
});

test("the phone keeps the page title and loses the desktop-only chrome", () => {
  const narrow = rulesIn("860px");
  assert.equal(declOf(narrow, ".factory-rail-toggle", "display"), "none",
    "the rail toggle has no rail to toggle on a phone");
  assert.equal(declOf(narrow, ".factory-crumb-root", "display"), "none",
    "a two-level crumb does not fit beside a title on a phone");
  assert.equal(declOf(narrow, ".home-panel-tiles-four", "grid-template-columns"), "minmax(0,1fr)",
    "the tiles stack rather than shrinking to four unreadable columns");
});

test("the home heading prefers a written name over the Etsy URL handle", () => {
  const home = read("home/home-view.tsx");
  /* /api/etsy returns shop_name, which is the handle: "shesawolfclothing". */
  assert.match(home, /account\.name \|\| etsy\.shopName \|\| null/);
});
