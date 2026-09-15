import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openPlan, storeSwitchUrl, editorUrl, SWITCH_SETTLE_MS } from "../app/printify-links.ts";

test("the store is switched before the editor is opened", () => {
  const plan = openPlan({ kind: "editor", shopId: 4143645, productId: "abc123" });
  assert.equal(plan.first, "https://printify.com/app/store/4143645/orders");
  assert.equal(plan.second, "https://printify.com/app/editor/abc123");
});

test("the switch uses the orders path, the only one measured to work", () => {
  /* /app/store/{id}/products bounces to the dashboard; /orders switches. */
  assert.match(storeSwitchUrl(99), /\/store\/99\/orders$/);
  assert.doesNotMatch(storeSwitchUrl(99), /products/);
});

test("with no shop id it goes straight there rather than via a wrong store", () => {
  const plan = openPlan({ kind: "editor", shopId: 0, productId: "abc123" });
  assert.equal(plan.first, editorUrl("abc123"));
  assert.equal(plan.second, null);
});

test("the products view is switched too, not only the editor", () => {
  const plan = openPlan({ kind: "products", shopId: 4143645 });
  assert.equal(plan.first, "https://printify.com/app/store/4143645/orders");
  assert.equal(plan.second, "https://printify.com/app/store/products");
});

test("a failed second step still leaves the member in the right store", () => {
  /* The fallback is the fix working partially, never the old breakage. */
  const plan = openPlan({ kind: "editor", shopId: 4143645, productId: "abc123" });
  assert.match(plan.first, /\/store\/4143645\//,
    "the first navigation does not select the store");
  assert.ok(SWITCH_SETTLE_MS > 0);
});

test("the measured routes are written down where the next person will look", () => {
  const module = readFileSync(new URL("../app/printify-links.ts", import.meta.url), "utf8");
  assert.match(module, /bounces to the dashboard/);
  assert.match(module, /switches the selected store/);
});

test("the app switches the store before opening drafts", () => {
  const ui = readFileSync(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  assert.match(ui, /function openInPrintify/);
  /* The single-draft path hands the shop id through, rather than opening a
     store-less editor link. */
  assert.match(ui, /openInPrintify\(\{kind:"editor",shopId:Number\(draft\.shopId\?\?0\)/);
  assert.doesNotMatch(ui, /window\.open\(draft\.editorUrl, "_blank"/);
  /* The bulk path switches once, because the store is per session. */
  assert.match(ui, /storeSwitchUrl\(shopId\)/);
  assert.match(ui, /selected store is per session, not per tab/);
});

test("noopener is kept on every tab that is opened", () => {
  const ui = readFileSync(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");
  const bulk = ui.slice(ui.indexOf("  function requestDraftTabs(editableDrafts"));
  /* Match to end of line: an inner call like storeSwitchUrl(id) closes a
     paren early and would otherwise read as a call with no options. */
  for (const call of bulk.slice(0, 1200).match(/window\.open\(.*$/gm) ?? [])
    assert.match(call, /noopener/, `a tab was opened without noopener: ${call}`);
});
