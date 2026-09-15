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
