/*
  The four features are one product. These are the seams between them, and the
  boundaries that must hold across those seams.
*/
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
  const watch = read("app/api/market-watch/niches/route.ts");
  for (const [name, source] of [["scan", scanner], ["niche watch", watch]])
    assert.match(source, /from "@\/app\/niche-cohort"/, `${name} does not share the matcher`);
  for (const source of [scanner, watch]) {
    assert.match(source, /normalizeNiche/);
    assert.match(source, /intersect\(/);
  }
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
  /* Every block is conditional, and the strip disappears entirely when empty. */
  assert.match(HOME_STATUS, /if \(!lines\.length\) return null;/);
  assert.match(HOME_STATUS, /if \(blocks\.factory\)/);
  assert.doesNotMatch(strip(HOME_STATUS), /cron|queue|backlog|health|apiUsage/i);
});

test("home never shows an unevidenced profit as a number", () => {
  assert.match(HOME_STATUS, /profitAvailable/);
  assert.match(HOME_STATUS, /profit unavailable/);
});

test("Market Watch gives no next move", () => {
  const text = MW_CLIENT.toLowerCase();
  for (const banned of ["you should", "next move", "we recommend", "try listing",
    "consider adding"])
    assert.ok(!text.includes(banned), `Market Watch said "${banned}"`);
});

test("the Trademark Checker works on a phone", () => {
  /* It rendered inside FactoryShell, which carries the desktop gate, so the
     checker — a search box — told phone users to find a bigger screen. Only
     the Listing Factory is desktop-only. */
  const page = read("app/trademark/page.tsx");
  assert.match(page, /if \(narrow\)/);
  assert.match(page, /className="tm-standalone"/);
  assert.match(page, /max-width: 820px/);
  /* And the desktop rail is unchanged. */
  assert.match(page, /<FactoryShell active="trademark"/);
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

test("no screen calls the checker a tracker or promises alerts", () => {
  for (const file of ["app/trademark/page.tsx", "app/more/page.tsx",
    "app/home/page.tsx", "app/design-scanner/design-scanner-client.tsx"]) {
    const text = read(file).toLowerCase();
    for (const banned of ["tracker", "we'll alert", "we will alert", "notify you when",
      "watch this phrase", "monitor this phrase"])
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

test("the manifest opens the suite, standalone, at Home", () => {
  const manifest = JSON.parse(readFileSync(
    new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.match(manifest.start_url, /^\/home/);
  assert.ok((manifest.icons ?? []).some(icon => icon.sizes === "512x512"));
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
