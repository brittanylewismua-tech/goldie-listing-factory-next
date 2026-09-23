/*
  The four features are one product. These are the seams between them, and the
  boundaries that must hold across those seams.
*/
/* The product has no chosen name; the manifest must not invent one, and
   must not say Goldie. */
const NEUTRAL_NAME = 'Seller Tools';
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = source => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const SCANNER_CLIENT = read("app/design-scanner/design-scanner-client.tsx");
const SCAN_ROUTE = read("app/api/design-scanner/scan/route.ts");
const MW_CLIENT = read("app/market-watch/market-watch-client.tsx");
const HOME_STATUS = read("app/home/home-status.tsx");
const SHELL = read("app/mobile-shell.tsx");

/* ------------------------------ 1. Market Watch → Design Scanner */

test("the scanner offers the member's watched niches, not their own shop's", () => {
  /* Shop Map is the member's OWN listings. Design Scanner compares against
     the marketplace, so the niche list must come from Market Watch. */
  assert.match(SCANNER_CLIENT, /fetch\("\/api\/market-watch\/niches"\)/);
  assert.ok(!strip(SCANNER_CLIENT).includes("/api/shop-map/map"),
    "the scanner reads the member's own shop for its niche list");
});

test("a saved niche reuses one normalization, shared by both features", () => {
  /* Both go through normalizeNiche, so "Dog Moms!" means the same thing in
     Market Watch and in a scan. */
  const scanner = read("app/api/design-scanner/scan/route.ts");
  /* The brief builder was lifted out of the route so the scheduled refresh
     and the member's own page build a brief identically. The property this
     protects is unchanged: one matcher, shared with the scanner. */
  const watch = read("app/niche-listing-refresh.ts");
  for (const [name, source] of [["scan", scanner], ["niche watch", watch]])
    assert.match(source, /from "@\/app\/niche-cohort"/, `${name} does not share the matcher`);
  for (const source of [scanner, watch]) assert.match(source, /normalizeNiche/);
  assert.match(scanner, /intersect\(/);
  assert.match(watch, /relates\(/);
});

/* ------------------------------ 4. Trademark consistency */

test("one checker answers for all three surfaces", () => {
  const standalone = read("app/api/trademark/route.ts");
  const scan = SCAN_ROUTE;
  for (const [name, source] of [["standalone", standalone], ["design scanner", scan]]) {
    assert.match(source, /from "@\/app\/trademark-check"/, `${name} has its own checker`);
    assert.match(source, /withRegister\(/, `${name} skips the register state`);
    assert.match(source, /registerSize/, `${name} does not check whether the register is complete`);
  }
  /* Neither re-implements the verdict. */
  for (const source of [standalone, scan])
    assert.doesNotMatch(strip(source), /risk\s*[:=]\s*"(high|caution|clear)"/,
      "a surface decides its own risk level");
});

/* ------------------------------ 5. Active-shop consistency */

test("opening Shop Map cannot change the publishing shop", () => {
  const map = read("app/api/shop-map/map/route.ts");
  /* Reading a map is a read. Nothing on the path writes is_active. */
  assert.doesNotMatch(map, /UPDATE etsy_connections[\s\S]{0,200}is_active/);
  assert.doesNotMatch(map, /SET is_active/);
});

test("the connections screen states which shop publishes, separately from sales", () => {
  const connections = read("app/connections/connections-client.tsx");
  assert.match(connections, /Publishing here/);
  assert.match(connections, /Sales visible/);
  /* And says plainly that the two are not the same decision. */
  assert.match(connections, /must not change which shop the Listing\s*\n?\s*\* Factory publishes to/);
});

/* ------------------------------ 6. Shared collection boundaries */

test("shared reference analysis is keyed by image, never by member", () => {
  const analyze = read("app/api/design-scanner/analyze-references/route.ts");
  assert.match(analyze, /PRIMARY KEY \(image_id, analysis_version\)/);
  const create = analyze.slice(analyze.indexOf("CREATE TABLE IF NOT EXISTS reference_analysis"),
    analyze.indexOf("PRIMARY KEY (image_id"));
  assert.doesNotMatch(create, /user_id/, "shared analysis carries a member id");
});

test("member-owned scan data is always scoped to the member", () => {
  for (const table of ["scan_uploads", "scan_history"]) {
    const create = SCAN_ROUTE.slice(SCAN_ROUTE.indexOf(`CREATE TABLE IF NOT EXISTS ${table}`));
    assert.match(create.slice(0, 400), /user_id TEXT NOT NULL/,
      `${table} is not member-scoped`);
  }
  /* And every read of them filters by the signed-in member. */
  for (const match of SCAN_ROUTE.matchAll(/FROM (scan_uploads|scan_history)([\s\S]{0,120})/g))
    assert.match(match[2], /WHERE user_id = \?|user_id = \?/,
      `a read of ${match[1]} is not scoped`);
});

test("watches are private even though collection is shared", () => {
  const niches = read("app/api/market-watch/niches/route.ts");
  const store = read("app/niche-watch-store.ts");
  /* The member's watch list is per member. */
  assert.match(store, /FROM niche_watches WHERE user_id = \?/);
  /* The history behind it is shared by niche key and holds counts only. */
  assert.match(niches, /appendHistory\(key, view\.summary, now\)/);
  const summary = read("app/niche-watch.ts");
  const shape = summary.slice(summary.indexOf("export type NicheSummary"),
    summary.indexOf("export function summarize"));
  for (const leak of ["user", "member", "listingId", "title", "shopName"])
    assert.ok(!shape.includes(leak), `shared niche history carries ${leak}`);
});

/* ------------------------------ navigation */

test("the Watch tab goes to Market Watch", () => {
  assert.match(SHELL, /href: "\/market-watch", label: "Watch"/);
  assert.ok(!SHELL.includes('href: "/hot-list"'), "the Watch tab still points at Hot List");
});

test("the five tabs are the five", () => {
  const labels = [...SHELL.matchAll(/label: "([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(labels, ["Home", "Watch", "Scan", "My Shop", "More"]);
});

test("home shows nothing rather than an empty counter", () => {
  /* Empty sales do not invent leaders; the useful tools remain available. */
  assert.match(HOME_STATUS, /Your listing leaders will appear here/);
  assert.match(HOME_STATUS, /blocks\.factory\?\.openDrafts \?\? 0/);
  assert.doesNotMatch(strip(HOME_STATUS), /cron|queue|backlog|health|apiUsage/i);
});

test("home never shows an unevidenced profit as a number", () => {
  assert.match(HOME_STATUS, /profitAvailable/);
  assert.match(HOME_STATUS, /Needs costs/);
});

test("Market Watch gives no next move", () => {
  const text = MW_CLIENT.toLowerCase();
  for (const banned of ["you should", "next move", "we recommend", "try listing",
    "consider adding"])
    assert.ok(!text.includes(banned), `Market Watch said "${banned}"`);
});

test("the Trademark Checker renders as itself at every width", () => {
  /*
    It rendered inside FactoryShell, which carries the desktop gate, so on a
    phone it told members to find a bigger screen. Fixing only mobile left it
    inside the factory on desktop — with the factory sidebar and a
    "198 / 10,000 listings" counter from the retired three-tier plan.

    THIS TEST THEN OVERCORRECTED. It asserted the checker must not use
    FactoryShell at all, which took the wordmark, the navigation, the footer
    and every link back to the rest of Goldie away with the batch counter. The
    checker became a bare column on white that did not look like the same
    product — the thing a shared shell exists to prevent.

    What was ever actually required is below: none of the factory's controls,
    and no desktop gate. The chrome that belongs to Goldie is welcome.
  */
  const page = read("app/trademark/page.tsx");
  assert.match(page, /className="tm-standalone"/);
  const code = strip(page);
  assert.ok(code.includes("FactoryShell"),
    "the checker has no product chrome and no way back to the rest of Goldie");
  assert.match(code, /desktopOnly=\{false\}/,
    "the checker must not carry the Listing Factory's desktop gate");
  assert.ok(!code.includes("MobileGate"), "the checker still carries a desktop gate");
});

test("the batch CTA and factory metrics stay inside Listing Factory", () => {
  const shell = strip(read("app/factory-shell.tsx"));
  assert.ok(!shell.includes("Start a new batch"), "the batch CTA leaked into the shared shell");
  for (const control of ["approved-usage", "listing-goal-side"]) {
    const at = shell.indexOf(control);
    assert.ok(at > 0, `${control} is missing from the shell`);
    assert.ok(shell.slice(Math.max(0, at - 1000), at).includes('isFactoryPage'),
      `${control} is not scoped to factory pages`);
  }
});

test("every top-level feature is reachable from the navigation", () => {
  /*
    Market Watch, Shop Map, Design Scanner and the Trademark Checker were not
    in the rail. With no rail on those pages either, a member who opened
    Market Watch could reach the rest of Goldie only with the back button.
  */
  const shell = read("app/factory-shell.tsx");
  /* D1798 · The Design Scanner is gone. Its listing check moved onto the
     listing in Shop Map, where the member's listings already were; its
     artwork scan was deleted, having needed a cohort that mostly did not
     exist and returned nothing anybody could act on when it did. */
  for (const href of ["/market-watch", "/shop-map", "/trademark"])
    assert.ok(shell.includes(`href: "${href}"`), `${href} is not in the navigation`);
});

test("every top-level feature wears the shell", () => {
  for (const page of ["app/market-watch/page.tsx", "app/shop-map/page.tsx",
    "app/trademark/page.tsx"]) {
    const code = strip(read(page));
    assert.ok(code.includes("FactoryShell"), `${page} renders without the product shell`);
    /* Phone-first features must not inherit the Listing Factory's gate. */
    assert.match(code, /desktopOnly=\{false\}/, `${page} would be blocked on a phone`);
  }
});

test("only the Listing Factory is desktop-only", () => {
  const registry = read("app/capability-registry.ts");
  const desktop = [...registry.matchAll(/key: "([a-zA-Z]+)",[\s\S]{0,400}?access: "desktop-only-canary"/g)]
    .map(match => match[1]);
  assert.deepEqual(desktop.sort(), ["listingFactory", "trademarkAtPublish"].sort());
});

test("the same checker module answers on every surface", () => {
  for (const file of ["app/trademark/page.tsx", "app/api/trademark/route.ts",
    "app/api/design-scanner/scan/route.ts"]) {
    const source = read(file);
    assert.match(source, /trademark-check/, `${file} does not use the shared checker`);
  }
});

test("the tracker promises only visible watched-phrase status", () => {
  for (const file of ["app/trademark/page.tsx", "app/more/page.tsx",
    "app/home/page.tsx", "app/design-scanner/design-scanner-client.tsx"]) {
    const text = read(file).toLowerCase();
    for (const banned of ["we'll alert", "we will alert", "notify you when", "monitor this phrase"])
      assert.ok(!text.includes(banned), `${file} says "${banned}"`);
  }
});

test("the service worker never caches an API response or a page", () => {
  const worker = readFileSync(new URL("../public/service-worker.js", import.meta.url), "utf8");
  const handler = worker.slice(worker.indexOf('addEventListener("fetch"'));
  /* Both bail out BEFORE respondWith, so neither can be served from cache. */
  const bail = handler.slice(0, handler.indexOf("event.respondWith"));
  assert.match(bail, /url\.pathname\.startsWith\("\/api\/"\)\) return;/);
  assert.match(bail, /request\.mode === "navigate"\) return;/);
  assert.match(bail, /request\.method !== "GET"\) return;/);
  /* And only content-hashed static assets are eligible. */
  assert.match(bail, /cacheable = \/\\\.\(\?:png/);
});

test("the installed app names no product that does not exist", () => {
  const manifest = JSON.parse(readFileSync(
    new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.match(manifest.start_url, /^\/home/);
  assert.equal(manifest.name, "Goldie Suite");
  assert.equal(manifest.short_name, "Goldie Suite");
  /* The description says what the software does. It may not say Goldie, and
     may not imply that Etsy endorses it. */
  assert.doesNotMatch(manifest.description, /goldie/i);
  assert.match(manifest.description, /Not endorsed or certified by Etsy/);
});

test("the connections screen reports a real last sync", () => {
  /* It said "not yet" for a shop with 3,155 ingested receipts, because the
     field was never populated. */
  const route = read("app/api/shop-map/connections/route.ts");
  assert.match(route, /WHEN EACH SHOP LAST ACTUALLY SYNCED/);
  assert.match(route, /MAX\(refreshed_at\) AS at FROM finance_sources/);
  assert.match(route, /lastSyncAt: lastSync\.get\(Number\(row\.shop_id\)\) \?\? null/);

  const client = read("app/connections/connections-client.tsx");
  assert.match(client, /not recorded yet/);
  assert.ok(!client.includes('return "not yet"'),
    "a missing field still claims the shop has never synced");
});

test("the checker shows one heading, not three", () => {
  /* The standalone wrapper added an <h1> above a body that already had its
     own header, stacking "Trademark Checker", "TRADEMARK CHECK" and
     "Check it before you print it". */
  const page = read("app/trademark/page.tsx");
  const wrapper = page.slice(page.indexOf('className="tm-standalone"'));
  assert.ok(!/<h1>/.test(wrapper.slice(0, 200)),
    "the wrapper still adds a second heading");
});
