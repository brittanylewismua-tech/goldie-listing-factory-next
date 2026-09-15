/*
  A TIMEZONE BELONGS TO ONE MEMBER'S ONE SHOP.

  The map briefly carried `|| "America/Los_Angeles"`. That is Brittany's
  shop's answer, and inheriting it would silently move another member's
  revenue between months with nothing on screen to explain why their totals
  disagree with Etsy's.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const store = readFileSync(new URL("../app/finance-store.ts", import.meta.url), "utf8");
const map = readFileSync(new URL("../app/api/shop-map/map/route.ts", import.meta.url), "utf8");
const settings = readFileSync(new URL(
  "../app/api/shop-map/financial/settings/route.ts", import.meta.url), "utf8");

test("no timezone is hardcoded as a fallback anywhere in Shop Map", () => {
  for (const [name, source] of [["map", map], ["store", store]])
    assert.doesNotMatch(source, /\|\|\s*["']America\//,
      `${name} falls back to a specific timezone`);
  assert.match(map, /NO FALLBACK TIMEZONE, EVER/);
});

test("it is keyed by member and shop, and defaults to nothing", () => {
  assert.match(store, /PRIMARY KEY \(user_id, shop_id\)\)`\),/);
  assert.match(store, /timezone TEXT NOT NULL DEFAULT ''/);
  /* Two shops for one member keep two answers. */
  assert.match(store, /user_id = \? AND shop_id = \?/);
});

test("an unconfirmed timezone is not an answer", () => {
  const reader = store.slice(store.indexOf("export async function shopTimezone"));
  assert.match(reader.slice(0, 400), /row\?\.confirmed \? String\(row\.timezone/);
  assert.match(settings, /monthlyFiguresAvailable: state\.confirmed/);
});

test("the browser's guess is remembered, never applied on its own", () => {
  assert.match(store, /rememberDetectedTimezone/);
  assert.match(store, /Stored as a suggestion, never used until confirmed/);
  assert.match(settings, /needsConfirmation: !state\.confirmed/);
  /* Detection writes only the detected column. */
  const remember = store.slice(store.indexOf("export async function rememberDetectedTimezone"));
  assert.doesNotMatch(remember.slice(0, 500), /confirmed = 1/);
});

test("changing it forces affected rollups to be recomputed", () => {
  const setter = store.slice(store.indexOf("export async function setShopTimezone"));
  assert.match(setter, /DELETE FROM finance_rollups WHERE user_id = \? AND shop_id = \?/);
  assert.match(setter, /before\.timezone !== timezone/);
});

test("monthly money is blocked without this shop's own timezone", () => {
  assert.match(map, /timezoneNeeded: !timezone/);
  assert.match(map, /const window = timezone \? monthWindow\(month, timezone\) : null/);
});

test("daylight saving still comes from IANA rules", () => {
  const month = readFileSync(new URL("../app/finance-month.ts", import.meta.url), "utf8");
  assert.match(month, /timeZone: timezone/);
  assert.match(month, /offsetSeconds/);
  /* Resolved at each boundary rather than once for the month. */
  assert.match(month, /Resolve twice/);
});

test("Shop Map detects the browser timezone and asks once", () => {
  const client = readFileSync(new URL(
    "../app/shop-map/shop-map-client.tsx", import.meta.url), "utf8");
  assert.match(client, /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
  /* Asked, not applied. */
  assert.match(client, /My shop runs on \$\{detected\}/);
  assert.match(client, /asks rather than assumes/);
  /* And the money card is replaced, not shown with wrong numbers. */
  assert.match(client, /map\.timezoneNeeded/);
});
