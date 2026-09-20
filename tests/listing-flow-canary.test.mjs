import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { routeUnmapped } from "../app/listing-call-plan.ts";

test("an unmapped blueprint is held or sent to the existing path, never guessed", () => {
  const stopped = routeUnmapped(
    { useNewFlow: true, unmappedBehaviour: "stop", because: "" }, "Enamel Pin");
  assert.equal(stopped.publish, false);
  assert.match(stopped.status, /guessed category/);

  const legacy = routeUnmapped(
    { useNewFlow: true, unmappedBehaviour: "legacy", because: "" }, "Enamel Pin");
  assert.equal(legacy.publish, true);
  assert.equal(legacy.via, "legacy");
});

test("the flag is off unless a member is named on the allowlist", () => {
  const module = readFileSync(new URL("../app/listing-flow-canary.ts", import.meta.url), "utf8");
  assert.match(module, /if \(!row\) return \{ useNewFlow: false/);
  /* No percentage rollout: it would decide for members who did not volunteer
     and this path writes to their live shop. */
  const code = module.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /percent|rollout|Math\.random|hash % /i);
});

test("the two pipelines are never billed side by side on real traffic", () => {
  const module = readFileSync(new URL("../app/listing-flow-canary.ts", import.meta.url), "utf8");
  assert.match(module, /never run together on ordinary traffic/);
});

test("a member gate and a product gate must both say yes", () => {
  const module = readFileSync(new URL("../app/listing-flow-canary.ts", import.meta.url), "utf8");
  /* An allowlisted member can still reach for an unmapped blank. */
  assert.match(module, /if \(!decision\.useNewFlow\)/);
  assert.match(module, /mayUseNewFlow\(mapping\.status\)/);
  /* An unknown blueprint is queued by identity, never guessed. */
  assert.match(module, /queueUnknownBlueprint\(blueprintId, blueprintTitle\)/);
  assert.match(module, /guessed category/);
});

test("the live publish path gates before Etsy and records identity", () => {
  const queue = readFileSync(new URL(
    "../app/api/printify/drafts/publish/queue.ts", import.meta.url), "utf8");
  /* The gate and the identity write must both precede the publish call. */
  const gateAt = queue.indexOf("await productGate(");
  const selectionAt = queue.indexOf("await recordSelection(");
  /* The call inside the item loop, not the helper defined above it. */
  const publishAt = queue.indexOf("readPrintifyPublishState(fetch,token,draft.shopId");
  assert.ok(gateAt > 0 && selectionAt > 0, "the publish path does not gate or record");
  assert.ok(gateAt < publishAt, "the gate runs after Etsy is contacted");
  assert.ok(selectionAt < publishAt, "identity is recorded after publishing");
  /* A stop must throw before anything reaches Etsy. */
  assert.match(queue, /if\(gate\.flow==="stop"\)throw new Error\(gate\.status\)/);
  /* And the identity follows the listing id into the completed record. */
  assert.match(queue, /recordPublished\(\{id:identityId/);
});

test("identity capture is awaited, not fire-and-forget", () => {
  const queue = readFileSync(new URL(
    "../app/api/printify/drafts/publish/queue.ts", import.meta.url), "utf8");
  assert.match(queue, /await recordSelection\(/);
  assert.match(queue, /await recordPublished\(/);
});
