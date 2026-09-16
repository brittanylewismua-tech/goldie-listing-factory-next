/*
  THE SHARED SHELL CARRIES NO PRODUCT NAME.

  The umbrella product has not been named. Until it is, the chrome every
  feature wears carries no name, no wordmark and no mark — and no placeholder
  standing in for one, because a placeholder in a rail, a tab title or a
  home-screen tile is exactly how a temporary name becomes the real one.

  Features may name themselves: Listing Factory, Design Scanner, Market Watch,
  Shop Watch, Shop Map, Trademark Checker. The Listing Factory's wordmark is a
  FEATURE's mark and belongs on its own pages only.

  Infrastructure is deliberately out of scope: event names, storage keys,
  bucket bindings, User-Agent strings and the domain are not what a member
  reads, and churning them would be risk without benefit.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP = new URL("../app/", import.meta.url).pathname;
const read = name => readFileSync(join(APP, name), "utf8");

/* Files a member reads from, rather than the whole tree. */
const MEMBER_SURFACES = [
  "factory-shell.tsx", "mobile-gate.tsx", "mobile-shell.tsx", "layout.tsx",
  "home/page.tsx", "more/page.tsx",
  "market-watch/market-watch-client.tsx", "shop-map/shop-map-client.tsx",
  "shop-map/costs/costs-client.tsx", "design-scanner/design-scanner-client.tsx",
  "trademark/page.tsx", "production-cost.ts", "deletion-plan.ts",
];

/* Internal identifiers that are not branding and are explicitly left alone. */
const INFRASTRUCTURE = [
  "goldie-history-loaded", "goldie-install-asked", "goldieInstallEvent",
  "goldie-tabs", "goldie-install", "goldie-colors-", "goldie-sizes-",
  "goldie-spin", "goldie-wordmark-lockup", "Goldie-Listing-Factory",
  "goldie-background", "goldie-g.png", "thegoldiesuite",
  /* A module path, not a word anybody reads. Renaming files is churn. */
  "./goldie-wordmark",
];

/** Strip comments and known infrastructure, leaving what a member could see. */
function memberVisible(source) {
  let text = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  for (const token of INFRASTRUCTURE) text = text.split(token).join("");
  return text;
}

test("no member-facing surface names the old product", () => {
  const offenders = [];
  for (const file of MEMBER_SURFACES) {
    let source;
    try { source = read(file); } catch { continue; }
    if (/goldie/i.test(memberVisible(source))) offenders.push(file);
  }
  assert.deepEqual(offenders, [],
    `these still show the old product name: ${offenders.join(", ")}`);
});

test("the rail's wordmark is the Listing Factory's, and only on its pages", () => {
  const identity = read("shell-identity.ts");
  const shell = read("factory-shell.tsx");
  /* Home is the way in to everything, so it is NOT a Listing Factory page. */
  assert.match(identity, /new Set<ShellSection>\(\["factory", "batches", "keywords"\]\)/,
    "Home is the way in to everything and is not a Listing Factory page");
  assert.match(shell, /showsListingFactoryWordmark\(active\) && \(/,
    "the wordmark must be conditional, not always rendered");
  /* And nothing stands in for it elsewhere. */
  const rail = shell.slice(shell.indexOf("<header className=\"topbar\">"),
    shell.indexOf("<div className=\"factory-main\">"));
  assert.doesNotMatch(memberVisible(rail), /suite|Suite/,
    "the shared rail must not name an umbrella product");
});

test("no page title, manifest or install prompt names a product", () => {
  const layout = memberVisible(read("layout.tsx"));
  assert.match(layout, /NEUTRAL_FALLBACK_TITLE/);
  assert.doesNotMatch(layout, /goldie-g\.png|apple-touch-icon/i,
    "a favicon is a mark in the place a member looks most often");
  const manifest = JSON.parse(readFileSync(
    new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
  for (const field of ["name", "short_name", "description"])
    assert.doesNotMatch(String(manifest[field] ?? ""), /goldie|suite/i);
});

test("the neutral fallback is a description, not a coined name", () => {
  const identity = read("shell-identity.ts");
  const match = /NEUTRAL_FALLBACK_TITLE = "([^"]+)"/.exec(identity);
  assert.ok(match, "there must be exactly one place to change when the name exists");
  const title = match[1];
  assert.ok(title.split(" ").length >= 2,
    "a single word reads as a product name rather than a description");
  assert.doesNotMatch(title, /goldie|suite/i);
});

test("each feature names itself in its own tab title", () => {
  const identity = read("shell-identity.ts");
  for (const name of ["Listing Factory", "Design Scanner", "Market Watch",
    "Shop Map", "Trademark Checker"])
    assert.ok(identity.includes(`"${name}"`), `${name} has no tab title`);
  /* No suffix: a suffix is where a suite name would go. */
  assert.doesNotMatch(identity, /\$\{.*\} · |" · "/,
    "a title suffix is a product name waiting to happen");
});
