import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canOpenStep, canOpenPhase, blockedReasons, resumeStep,
  WORKFLOW_ORDER, FINISH_ORDER,
} from "../app/workflow-gates.ts";

/* Traversal guard.
 *
 * Every navigation blocker this project has shipped came from the same place:
 * a gate condition changed for one caller, silently closing the path for the
 * others. D53 (could not enter Finish on a resumed batch) and D73 (could not
 * move between Finish phases) were both this.
 *
 * These tests assert the properties that must hold no matter how the gates are
 * edited. If one fails, a seller is stranded somewhere. */

const base = {
  localPreview: false,
  connected: true,
  etsyConnected: true,
  productSelected: true,
  templateLoaded: true,
  ready: true,
  complete: false,
  hasDrafts: false,
};

const states = {
  "fresh, nothing connected": { ...base, connected: false, etsyConnected: false, productSelected: false, templateLoaded: false, ready: false },
  "connected, no product": { ...base, productSelected: false, templateLoaded: false, ready: false },
  "product chosen, no designs": { ...base, ready: false },
  "designs added, no drafts": { ...base },
  "complete with drafts": { ...base, complete: true, hasDrafts: true },
};

test("a completed batch can reach every step — D53", () => {
  const s = states["complete with drafts"];
  for (const step of WORKFLOW_ORDER) {
    assert.equal(canOpenStep(step, s), true,
      `A batch with real Printify drafts cannot open "${step}". The seller has already paid for these listings and must always be able to reach them.`);
  }
});

test("a completed batch can reach every Finish phase — D73", () => {
  const s = states["complete with drafts"];
  for (const phase of FINISH_ORDER) {
    assert.equal(canOpenPhase(phase, s), true,
      `A completed batch cannot open Finish phase "${phase}". This strands the seller on whichever phase loads first.`);
  }
});

test("Finish phases are reachable in any order, not just forward", () => {
  const s = states["complete with drafts"];
  for (const from of FINISH_ORDER) {
    for (const to of FINISH_ORDER) {
      assert.equal(canOpenPhase(to, s), true,
        `Cannot go from "${from}" to "${to}". Phases are views over existing drafts and must be freely navigable.`);
    }
  }
});

test("every batch state can reach at least one step", () => {
  for (const [name, s] of Object.entries(states)) {
    const open = WORKFLOW_ORDER.filter((step) => canOpenStep(step, s));
    assert.ok(open.length > 0, `State "${name}" cannot open any step at all — the seller has nowhere to go.`);
  }
});

test("a blocked step always explains itself — no silent no-ops", () => {
  for (const [name, s] of Object.entries(states)) {
    for (const step of WORKFLOW_ORDER) {
      const open = canOpenStep(step, s);
      const reasons = blockedReasons(step, s);
      if (open) {
        assert.deepEqual(reasons, [], `"${step}" is open in "${name}" but still reports blocking reasons.`);
      } else {
        assert.ok(reasons.length > 0,
          `"${step}" is blocked in "${name}" but gives no reason. A control that cannot act must say why — never render it enabled and inert.`);
        for (const r of reasons) {
          assert.ok(typeof r === "string" && r.trim().length > 0, `Empty blocking reason for "${step}" in "${name}".`);
        }
      }
    }
  }
});

test("resuming a batch lands where the work actually is", () => {
  assert.equal(resumeStep(states["complete with drafts"]), "finish",
    "A batch with drafts must resume into Finish, not back at Add your designs.");
  assert.equal(resumeStep(states["designs added, no drafts"]), "review");
  assert.equal(resumeStep(states["product chosen, no designs"]), "designs");
  assert.equal(resumeStep(states["connected, no product"]), "setup");
  assert.equal(resumeStep(states["fresh, nothing connected"]), "connect");
});

test("no gate condition can close a completed batch", () => {
  // Flip every non-completion flag to false and confirm the batch stays navigable.
  const flags = ["connected", "etsyConnected", "productSelected", "templateLoaded", "ready"];
  for (const flag of flags) {
    const s = { ...states["complete with drafts"], [flag]: false };
    for (const step of WORKFLOW_ORDER) {
      assert.equal(canOpenStep(step, s), true,
        `With "${flag}" false, a completed batch can no longer open "${step}". Completion must override every other condition — this is the exact shape of D53.`);
    }
  }
});
