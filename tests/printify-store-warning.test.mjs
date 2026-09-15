import test from "node:test";
import assert from "node:assert/strict";
import { storeWarning } from "../app/printify-store-warning.ts";
import { readFileSync } from "node:fs";

/* The real account that produced the support ticket. */
const HOUSE = [
  { id: 4143645, title: "HousePanthers", salesChannel: "etsy" },
  { id: 28305163, title: "HousePanthers", salesChannel: "storefront" },
];

test("one store says nothing at all", () => {
  const quiet = storeWarning([HOUSE[0]], 4143645);
  assert.equal(quiet.warn, false);
  assert.equal(quiet.headline, "");
});

test("two stores with the same name is called out as exactly that", () => {
  const warning = storeWarning(HOUSE, 4143645);
  assert.equal(warning.warn, true);
  assert.equal(warning.duplicateName, true);
  assert.match(warning.headline, /same name/);
});

test("the channel is named, because the name alone cannot separate them", () => {
  const warning = storeWarning(HOUSE, 4143645);
  /* "HousePanthers" twice is useless; the channel is the distinguishing fact. */
  assert.match(warning.detail, /HousePanthers \(Etsy store\)/);
  assert.match(warning.detail, /Etsy store/);
});

test("the warning predicts the exact error the member would otherwise hit", () => {
  const warning = storeWarning(HOUSE, 4143645);
  assert.match(warning.detail, /isn't available/);
});

test("two differently named stores still warn, without claiming a name clash", () => {
  const warning = storeWarning([
    HOUSE[0], { id: 999, title: "Side Project", salesChannel: "storefront" }], 4143645);
  assert.equal(warning.warn, true);
  assert.equal(warning.duplicateName, false);
  assert.doesNotMatch(warning.headline, /same name/);
});

test("it names the store Goldie actually builds into, not the first one", () => {
  const warning = storeWarning(HOUSE, 28305163);
  assert.equal(warning.buildingIn.id, 28305163);
  assert.match(warning.detail, /Printify storefront/);
});

test("an unknown build store produces no confident claim", () => {
  const warning = storeWarning(HOUSE, 55555);
  assert.equal(warning.warn, false);
  assert.equal(warning.buildingIn, null);
});

test("the warning is wired into the template response and shown before building", () => {
  const route = readFileSync(new URL("../app/api/printify/route.ts", import.meta.url), "utf8");
  assert.match(route, /storeWarning: storeWarning\(/);
  assert.match(route, /sales_channel/);
  const ui = readFileSync(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  assert.match(ui, /setPrintifyStoreWarning/);
  assert.match(ui, /printifyStoreBanner/);
  /* It has to appear at template time, not only once drafts exist. */
  const setAt = ui.indexOf("setPrintifyStoreWarning(");
  const draftsAt = ui.indexOf("bundlePublishDrafts().some");
  assert.ok(setAt > 0 && setAt < draftsAt,
    "the warning is only set after drafts are built");
});

test("the mechanism is explained for differently-named stores too", () => {
  /* The failure is 'more than one store', not 'two stores with one name'.
     The names only decide how hard it is to notice. */
  const warning = storeWarning([
    HOUSE[0], { id: 999, title: "Side Project", salesChannel: "storefront" }], 4143645);
  assert.match(warning.detail, /whichever store you last had selected/);
  assert.match(warning.detail, /isn't available/);
});

test("every control that opens Printify names the store", () => {
  const ui = readFileSync(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  /* A warning at setup is forgotten by the time a draft is opened days
     later, and the failure happens at the click. */
  assert.match(ui, /printifyOpenHint/);
  assert.match(ui, /printifyStoreLabel/);
  assert.match(ui, /Adjust in Printify \(\$\{printifyStoreLabel\(\)\}\)/);
  assert.match(ui, /set Printify to that store first/);
});
