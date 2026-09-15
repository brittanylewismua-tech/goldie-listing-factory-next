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

test("the mechanism is explained for differently-named stores too", () => {
  /* The failure is 'more than one store', not 'two stores with one name'.
     The names only decide how hard it is to notice. */
  const warning = storeWarning([
    HOUSE[0], { id: 999, title: "Side Project", salesChannel: "storefront" }], 4143645);
  assert.match(warning.detail, /whichever store you last had selected/);
  assert.match(warning.detail, /isn't available/);
});

test("the store warning is no longer shown to members", () => {
  /*
    D1453 switches the store automatically, so telling a member to "set
    Printify to that store first" instructs them to do something Goldie has
    already done. A false instruction is worse than no instruction.

    The module is kept: it is what the owner support lookup uses to explain
    an account, and it is still returned by the template endpoint for that
    purpose. It simply does not render to the member any more.
  */
  const ui = readFileSync(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(ui, /set Printify to that store first/);
  assert.doesNotMatch(ui, /printifyStoreBanner|printifyOpenHint|printifyStoreNote/);
});
