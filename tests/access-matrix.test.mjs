/*
  Hiding a link is not access control. Every member-facing route names the
  plans that may reach it, and a route that forgets fails this file.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ACCESS, OWNER_PREFIXES, isOwnerRoute, ruleFor } from "../app/access-matrix.ts";
import { allows, SUITE_PLANS } from "../app/suite-plans.ts";

const appDir = fileURLToPath(new URL("../app/", import.meta.url));

/* Every route the application actually serves, discovered from the tree. */
const routes = [];
const walk = dir => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) { walk(full); continue; }
    if (name !== "route.ts" && name !== "page.tsx") continue;
    const rel = full.slice(appDir.length).replace(/(^|\/)(route\.ts|page\.tsx)$/, "");
    routes.push(rel ? `/${rel}` : "/");
  }
};
walk(appDir);

/* Dynamic segments and the root page are matched by prefix, not by name. */
const testable = routes
  .map(route => (route === "/" ? "/" : route))
  .filter(route => !route.includes("["))
  .filter(route => route !== "/");

test("every route in the application has an access rule", () => {
  const missing = testable.filter(route => !ruleFor(route));
  assert.deepEqual(missing, [],
    `these routes have no entry in ACCESS and match no owner prefix:\n${missing.join("\n")}`);
});

test("no rule names a route that no longer exists", () => {
  const live = new Set(testable);
  const stale = Object.keys(ACCESS).filter(route =>
    !live.has(route) && !route.startsWith("/auth/"));
  assert.deepEqual(stale, [], `stale entries: ${stale.join(", ")}`);
});

test("owner routes are never reachable as a member route", () => {
  for (const route of Object.keys(ACCESS))
    assert.ok(!isOwnerRoute(route),
      `${route} is in the member matrix and also matches an owner prefix`);
});

test("the internal surface is owner-only", () => {
  for (const route of ["/api/operations/health", "/api/operations/capacity",
    "/api/operations/capabilities", "/api/operations/migrate",
    "/api/market/sensor-tick", "/api/design-scanner/corpus",
    "/api/trademark/ingest-tick", "/mastermind-admin"])
    assert.equal(ruleFor(route).kind, "owner", `${route} is not owner-only`);
});

test("sign-out, connections and account are never gated by a plan", () => {
  /* Gating these locks somebody out of the screen that would fix their
     account, or out of signing out of an expired one. */
  for (const route of ["/account/sign-out", "/connections", "/api/account",
    "/api/shop-map/connections", "/api/connections/printify", "/home", "/more",
    "/api/etsy/active"])
    assert.equal(ruleFor(route).kind, "open", `${route} requires a plan`);
});

test("OAuth return and sign-in need no entitlement", () => {
  for (const route of ["/account/sign-in", "/api/etsy/callback", "/auth/callback"])
    assert.equal(ruleFor(route).kind, "public", `${route} is gated`);
});

test("the Trademark Checker needs a sign-in but never a plan", () => {
  /* Measured against production: a signed-out caller gets 401. */
  for (const route of ["/trademark", "/api/trademark"])
    assert.equal(ruleFor(route).kind, "open", `${route} is gated by a plan`);
});

/* --------------------------------------------------- plan separation */

const NOW = 1_800_000_000;
const entitlement = (over = {}) => ({ state: "active", plan: "full_suite", until: null, ...over });

const reaches = (ent, route) => {
  const rule = ruleFor(route);
  if (!rule) return false;
  if (rule.kind === "public" || rule.kind === "open") return true;
  if (rule.kind === "owner") return false;
  return allows(ent, rule.feature, NOW).ok;
};

test("a Listing Factory member reaches the factory and nothing else", () => {
  const factory = entitlement({ plan: "listing_factory" });
  for (const route of ["/listing-factory", "/batches", "/api/batches",
    "/api/printify/drafts/publish", "/trademark", "/api/trademark"])
    assert.ok(reaches(factory, route), `${route} was refused`);
  for (const route of ["/design-scanner", "/api/design-scanner/scan",
    "/market-watch", "/api/market-watch/niches", "/api/shop-watch/brief",
    "/shop-map", "/api/shop-map/map", "/api/shop-map/financial"])
    assert.ok(!reaches(factory, route), `${route} was reachable`);
});

test("a Full Suite member reaches all four features and no owner route", () => {
  const suite = entitlement();
  for (const route of ["/listing-factory", "/design-scanner", "/market-watch",
    "/shop-map", "/trademark", "/api/design-scanner/scan", "/api/shop-map/map"])
    assert.ok(reaches(suite, route), `${route} was refused`);
  for (const route of ["/api/operations/health", "/api/operations/migrate",
    "/api/design-scanner/corpus", "/mastermind-admin"])
    assert.ok(!reaches(suite, route), `${route} was reachable by a member`);
});

test("a member with no entitlement keeps account access and nothing protected", () => {
  const none = entitlement({ state: "none", plan: null });
  for (const route of ["/home", "/more", "/connections", "/api/account",
    "/api/shop-map/connections", "/account/sign-out"])
    assert.ok(reaches(none, route), `${route} was refused — that is a lockout`);
  for (const route of ["/listing-factory", "/design-scanner", "/market-watch",
    "/shop-map", "/api/batches", "/api/market-watch/niches"])
    assert.ok(!reaches(none, route), `${route} leaked to an account with no plan`);
});

test("an expired beta reaches nothing protected, and is not locked out of its account", () => {
  const expired = entitlement({ state: "canceled", plan: "full_suite", until: NOW - 86_400 });
  assert.ok(!reaches(expired, "/design-scanner"));
  assert.ok(!reaches(expired, "/api/shop-map/map"));
  assert.ok(reaches(expired, "/connections"));
  assert.ok(reaches(expired, "/account/sign-out"));
});

test("past due keeps working through the grace window and stops after it", () => {
  const inGrace = entitlement({ state: "past_due", plan: "full_suite", until: NOW - 2 * 86_400 });
  assert.ok(reaches(inGrace, "/shop-map"));
  const after = entitlement({ state: "past_due", plan: "full_suite", until: NOW - 20 * 86_400 });
  assert.ok(!reaches(after, "/shop-map"));
  assert.ok(reaches(after, "/connections"));
});

test("complimentary beta reaches every feature without a payment", () => {
  const beta = entitlement({ state: "beta", plan: "full_suite" });
  for (const feature of Object.values(SUITE_PLANS).flatMap(plan => plan.features))
    assert.equal(allows(beta, feature, NOW).ok, true, `beta cannot use ${feature}`);
  assert.ok(!reaches(beta, "/api/operations/health"));
});

test("owner prefixes cover the whole internal tree", () => {
  const internal = testable.filter(route =>
    /\/(operations|mastermind|market)\//.test(route) || route.startsWith("/api/uspto"));
  for (const route of internal)
    assert.ok(isOwnerRoute(route), `${route} is internal but not owner-gated`);
  assert.ok(OWNER_PREFIXES.length > 10);
});

/* ------------------------------------------- enforcement, not decoration */
const src = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("every feature API enforces the gate, not the owner flag", () => {
  const routes = {
    "app/api/design-scanner/scan/route.ts": "designScanner",
    "app/api/market-watch/niches/route.ts": "marketWatch",
    "app/api/market-watch/shops/route.ts": "marketWatch",
    "app/api/market-watch/update/route.ts": "marketWatch",
    "app/api/shop-watch/brief/route.ts": "marketWatch",
    "app/api/shop-map/map/route.ts": "shopMap",
  };
  for (const [file, feature] of Object.entries(routes)) {
    const source = src(file);
    assert.match(source, new RegExp(`requireFeatureApi\\("${feature}"\\)`),
      `${file} does not gate on ${feature}`);
    assert.ok(!source.includes("isOwner(user)"),
      `${file} still gates on the owner flag, so no member can reach it`);
  }
});

test("every feature page enforces the same gate", () => {
  for (const [file, feature] of Object.entries({
    "app/design-scanner/page.tsx": "designScanner",
    "app/market-watch/page.tsx": "marketWatch",
    "app/shop-map/page.tsx": "shopMap",
  })) {
    const source = src(file);
    assert.match(source, new RegExp(`requireFeaturePage\\("${feature}"`),
      `${file} is not gated`);
  }
});

test("a refusal carries no feature data and cannot loop", () => {
  const helper = src("app/require-feature.ts");
  /* 401 when signed out, 403 when signed in without the feature. Never a
     redirect back to the page that refused. */
  assert.match(helper, /status: signedOut \? 401 : 403/);
  assert.match(helper, /redirect\(`\/more\?needs=/);
  /* /more is `open`, so the upgrade destination can never bounce back. */
  assert.equal(ruleFor("/more").kind, "open");
});

test("the owner is not an entitlement row", () => {
  /* A bad row must not lock the operator out of the tools that would fix it. */
  const entitlements = src("app/entitlements.ts");
  assert.match(entitlements, /if \(isOwner\(user\)\) return \{ state: "beta"/);
  assert.match(entitlements, /means a bad row locks the operator out/);
});

test("an account with no row gets nothing by default", () => {
  const entitlements = src("app/entitlements.ts");
  assert.match(entitlements, /if \(!row\) return NO_ENTITLEMENT;/);
  assert.match(entitlements, /DEFAULT IS NOTHING/);
});
