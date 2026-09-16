/*
  Reviews support evidence. They never create it, and they are fetched for
  shops that already matter to a member.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PRIORITY_ORDER, rank, planFetch, pagesFor, BOOTSTRAP_PAGES, INCREMENTAL_PAGES,
} from "../app/review-priority.ts";

const shop = (over = {}) => ({ shopId: 1, priority: "other-momentum",
  alreadyCollected: false, highWater: 0, ...over });

test("the priority order is the one the product specified", () => {
  assert.deepEqual(PRIORITY_ORDER,
    ["saved-niche", "repeated-movement", "scanner-cohort", "shop-watch", "other-momentum"]);
});

test("a saved niche outranks everything else", () => {
  const plan = planFetch([
    shop({ shopId: 1, priority: "other-momentum" }),
    shop({ shopId: 2, priority: "shop-watch" }),
    shop({ shopId: 3, priority: "saved-niche" }),
    shop({ shopId: 4, priority: "repeated-movement" }),
  ], { maxShops: 2 });
  assert.deepEqual(plan.fetch.map(row => row.shopId), [3, 4]);
  assert.equal(plan.deferred, 2);
});

test("one shop is one candidate, however many members want it", () => {
  /* Twenty watchers of one shop cost what one watcher costs. */
  const many = Array.from({ length: 20 }, () => shop({ shopId: 7, priority: "shop-watch" }));
  const plan = planFetch(many, { maxShops: 10 });
  assert.equal(plan.fetch.length, 1);
  assert.equal(plan.estimatedCalls, 2);
});

test("a shop keeps the strongest reason it qualified", () => {
  const plan = planFetch([
    shop({ shopId: 5, priority: "other-momentum" }),
    shop({ shopId: 5, priority: "saved-niche" }),
  ], { maxShops: 5 });
  assert.equal(plan.fetch[0].priority, "saved-niche");
});

test("at equal priority, a shop nobody has read goes first", () => {
  const plan = planFetch([
    shop({ shopId: 1, priority: "saved-niche", alreadyCollected: true, highWater: 100 }),
    shop({ shopId: 2, priority: "saved-niche", alreadyCollected: false }),
  ], { maxShops: 1 });
  assert.equal(plan.fetch[0].shopId, 2);
});

test("the budget caps the plan before any call is made", () => {
  const many = Array.from({ length: 50 }, (unused, index) =>
    shop({ shopId: index, priority: "saved-niche" }));
  const plan = planFetch(many, { maxShops: 40, budget: 10 });
  assert.equal(plan.fetch.length, 5, "the plan exceeds its call budget");
  assert.equal(plan.estimatedCalls, 10);
  assert.equal(plan.deferred, 45);
});

test("a first read is bounded and later reads are incremental", () => {
  assert.equal(pagesFor(shop({ highWater: 0 })), BOOTSTRAP_PAGES);
  assert.equal(pagesFor(shop({ highWater: 1_700_000_000 })), INCREMENTAL_PAGES);
  assert.ok(BOOTSTRAP_PAGES <= 3, "the first read is not bounded");
});

test("nothing here can qualify momentum", () => {
  const code = readFileSync(new URL("../app/review-priority.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  for (const banned of ["qualif", "momentumFrom", "sale", "sold", "units"])
    assert.ok(!code.toLowerCase().includes(banned),
      `review planning references ${banned}`);
});
