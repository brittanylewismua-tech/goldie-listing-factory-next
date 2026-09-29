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

test("the launcher home cannot grow past the page", () => {
  const homeCss=read("home-preview/preview.css");
  assert.match(homeCss, /\.goldie-home-grid\{[^}]*overflow:hidden/);
  assert.match(homeCss, /\.goldie-platform-grid\{display:grid;grid-template-columns:1fr 1fr/);
  assert.match(homeCss, /@media\(max-width:700px\)[\s\S]*\.goldie-home-grid\{padding:16px 16px 0\}/);
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

test("the phone keeps desktop chrome rules and Home has its own responsive launcher", () => {
  const narrow = rulesIn("860px");
  assert.equal(declOf(narrow, ".factory-rail-toggle", "display"), "none",
    "the rail toggle has no rail to toggle on a phone");
  assert.equal(declOf(narrow, ".factory-crumb-root", "display"), "none",
    "a two-level crumb does not fit beside a title on a phone");
  assert.match(read("home-preview/preview.css"), /@media\(max-width:700px\)/);
  const homeCss=read("home-preview/preview.css");
  assert.match(homeCss, /\.goldie-platform-grid\{display:grid;grid-template-columns:1fr 1fr/);
  assert.match(homeCss, /@media\(max-width:700px\)[\s\S]*\.goldie-platform-grid\{grid-template-columns:1fr;gap:22px/);
});

test("the rail says there is more below before you scroll it", () => {
  /* macOS hides overlay scrollbars until something moves, so the list stopped
     mid-item with no bar and no edge: Design Scanner, Shop Map, Trademark
     Tracker and Connections were all below the fold and invisible. */
  assert.match(sheet, /\.app-shell>\.topbar>\.top-actions\{[^}]*scrollbar-width:thin/);
  assert.match(sheet, /\.app-shell>\.topbar>\.top-actions\{[^}]*local no-repeat/);
  assert.match(sheet, /\.app-shell>\.topbar>\.top-actions::-webkit-scrollbar-thumb\{/);
});

test("one highlight, and both rail groups can wear it", () => {
  /* The white pill was the only white thing on a black rail, and only Listing
     Factory could ever get it because it is the only group that is also a
     page. The Command Center heading gets the same chip when current. */
  /* Changed at source in approved-redesign-components.css, which owned the
     white rule, rather than overridden from a later sheet. */
  const owner = read("approved-redesign-components.css");
  assert.doesNotMatch(owner, /\.top-nav a\.active \{[^}]*background: #fff/);
  assert.match(owner, /\.suite-nav-section\.current > \.suite-nav-parent > \.suite-nav-heading \{/);
  assert.match(owner, /\.suite-nav-heading::before \{[\s\S]*?display: block/);
});

test("Start a new batch sits above the links, not under Command Center", () => {
  const workflow = read("listing-factory-app.tsx");
  const button = workflow.indexOf("workflow-restart-button");
  const nav = workflow.indexOf('<SuiteSidebarNav active="factory"');
  assert.ok(button > -1 && nav > -1);
  assert.ok(button < nav, "the batch button is a Listing Factory action and comes first");
});

test("the rail keeps the gear mark", () => {
  /* D1764 swapped it for a wordmark because the preview drew one. Nobody
     asked for that. */
  const brand = read("suite-brand.tsx");
  assert.match(brand, /suite-brand-mark/);
  assert.doesNotMatch(brand, /suite-wordmark/);
});

test("Current home is the suite launcher and routes into the real tools", () => {
  const home = read("home-preview/preview-client.tsx");
  assert.match(home, /href:"\/shop-map"/);
  assert.match(home, /href:"\/listing-factory\?step=setup"/);
  assert.match(home, /href:"\/market-watch"/);
  assert.match(home, /href:"\/trademark"/);
  assert.match(home, /api\/platform-updates/);
});
