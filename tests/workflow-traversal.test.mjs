import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

/* D147 — the phase half of D108.
 *
 * Restoration replaced the requested Finish phase with the batch's saved one.
 * Measured on the deployed build: loading ?phase=etsy landed on phase=details,
 * and an earlier load of ?phase=details landed on phase=final. So a bookmark or
 * a browser reload on any Finish phase silently sends the seller somewhere else.
 *
 * Same rule as steps: a completed batch may open any phase; an unfinished one
 * may open any phase up to the furthest it reached. */
test("a requested Finish phase survives a reload — D147", async () => {
  const source = await (await import("node:fs/promises"))
    .readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  assert.match(source, /function restoredFinishPhase\(saved:FinishPhase,requested:string\|null,complete:boolean\):FinishPhase\{/);
  assert.match(source, /return complete\|\|order\.indexOf\(target\)<=order\.indexOf\(saved\)\?target:saved;/);
  assert.match(source, /setFinishPhase\(restoredFinishPhase\(state\.finishPhase\|\|"details",url\.searchParams\.get\("phase"\),Boolean\(state\.complete\)\)\)/,
    "Restoration must honour the requested phase, not overwrite it with the saved one.");
});

test("an open step never claims you must complete the prior one — D154", async () => {
  const source = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Both rails render `issues[0] || progressStatus(...)`, so progressStatus is only
   * reached when progressGateIssues() came back EMPTY — the step is open. Its
   * fallback branch nonetheless returned "Complete the prior step" whenever the
   * step was not the active one.
   *
   * Measured live on batch 103d12f0 (all three listings drafted, photos chosen):
   *   on Titles + tags  -> "Images + mockups" says "Complete the prior step", disabled false
   *   on Titles + tags  -> "Review + publish" says "Complete the prior step", disabled false
   *   on Etsy details   -> both of the above, disabled false
   *   on Images+mockups -> "Review + publish" says "Complete the prior step", disabled false
   * Clicking "Review + publish" opened it immediately and the rail then flipped to
   * "Ready to publish" — the label was stale, not the gate.
   *
   * Fix: progressStatus takes `blocked` and treats an open step like the active one. */
  assert.match(source, /function progressStatus\(index:number,active:boolean,done:boolean,blocked:boolean\)\{const live=active\|\|!blocked;/,
    "progressStatus must know whether the step is actually gated.");
  /* D220 collapsed the two rails into one four-stage rail, so the call site is
     progressStatus(stage.index, ...). What D154 requires is unchanged: EVERY
     progressStatus call must receive the real gate state, never a constant. */
  const calls = source.match(/progressStatus\([^)]*\)/g) || [];
  assert.ok(calls.length > 0, "progressStatus is called");
  for (const call of calls) {
    if (call.startsWith("progressStatus(index:")) continue;
    assert.match(call, /Boolean\(issues\.length\)?$/, `${call} must pass the real gate state`);
  }

  const body = source.split("\n")[505];
  assert.ok(!/[^a-zA-Z]active\?/.test(body),
    "No branch in progressStatus may key off `active` alone; use `live`.");
});

test("D224: no saved batch can land on a step that has no page", async () => {
  const source = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Measured live: resuming a saved batch opened ?step=review and rendered a
   * heading, a rail, a Back button and nothing else. Draft creation had moved
   * onto the Images page, so the review step had no panel left — but batches
   * saved before that change still store step:"review".
   *
   * Every entry point normalises: goToStep, the URL reader, and restored batch
   * state. */
  assert.match(source, /function normalizeStep\(step:WorkflowStep\):WorkflowStep\{return step==="review"\?"designs":step\}/);
  assert.match(source, /function goToStep\(rawStep:WorkflowStep,replace=false,force=false\)\{\s*const step=normalizeStep\(rawStep\);/);

  const setters = source.match(/setWorkflowStep\([^)]*\)/g) || [];
  for (const setter of setters) {
    const literal = /setWorkflowStep\(["'](\w+)["']/.exec(setter);
    if (literal) {
      assert.notEqual(literal[1], "review", `${setter} sends the seller to a page that does not exist`);
    } else {
      assert.match(setter, /normalizeStep/, `${setter} must normalise a non-literal step`);
    }
  }
});

test("D227: a run where every draft fails does not pretend to have succeeded", async () => {
  const source = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Measured on a real batch: both drafts came back status:"NeedsRetry" with a
   * null id, and runDrafts set complete and jumped to the Listing page anyway.
   * The seller then generated titles, and only afterwards met "The matching
   * Printify draft could not be found" beside every listing — with the rail
   * refusing the page they were standing on and no route back to retry. */
  assert.match(source, /const createdNow=createdDesignResults\.filter\(result=>result\.status==="Created"&&result\.id\)\.length;/);
  assert.match(source, /if\(createdNow>0\)\{\s*setComplete\(true\);/);
  assert.match(source, /\}else\{\s*setComplete\(false\);/, "a total failure must not mark the batch complete");
  assert.match(source, /None of these drafts could be created\./);
  assert.match(source, /Nothing was charged against your plan/);

  /* And the rail must never disable the stage the seller is on. */
  assert.match(source, /disabled=\{!active&&Boolean\(issues\.length\)\}/);
});

test("D229: no disabled control is silent about why", async () => {
  const source = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Measured live: the Images page showed "Continue to create drafts" greyed out
   * with Printify connected, the product chosen and 3 of 20 designs ready. The
   * button was disabled because prices were not approved — approval is
   * invalidated when designs change — but its label only covered the !ready
   * branch, so the reason appeared nowhere on the page. The rail knew; the
   * button did not say. */
  const launch = source.slice(source.indexOf('className="launch-button"'));
  const label = launch.slice(0, launch.indexOf("</button>"));

  assert.match(label, /!pricingApproved \? "Approve prices on the Product page to continue"/,
    "the pricing-approval branch must have a label");

  /* Every condition in `disabled` needs a matching branch in the label. */
  const disabled = /disabled=\{([^}]*)\}/.exec(launch)[1];
  for (const condition of ["ready", "pricingApproved", "running", "preparingEtsy"]) {
    assert.ok(disabled.includes(condition), `${condition} still gates the button`);
    assert.ok(label.includes(condition), `${condition} must be reflected in the label`);
  }
});

test("D229: the pricing approval button names every reason it is disabled", async () => {
  const source = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Measured live on a real batch: the Gildan Hoodie's saved Etsy shipping
   * profile (259760087290) was not among the 94 profiles on the shop, so nothing
   * was selected, "Approve prices and shipping" was dead, and no message
   * appeared anywhere. The Images page said to approve prices on the Product
   * page; the Product page silently refused. The seller is stuck between two
   * screens, each pointing at the other. */
  const button = source.slice(source.indexOf('className={`pricing-approval-button'));
  const label = button.slice(0, button.indexOf("</button>"));

  assert.match(label, /customDirty\?"Save or discard your custom profile to continue"/);
  assert.match(label, /!selectedProfile\?"Choose a shipping profile to continue"/);

  const disabled = /disabled=\{([^}]*)\}/.exec(button)[1];
  for (const condition of ["selectedProfile", "customDirty"]) {
    assert.ok(disabled.includes(condition));
    assert.ok(label.includes(condition), `${condition} must be reflected in the label`);
  }

  /* And a profile that has disappeared from the shop is called out. */
  assert.match(source, /The shipping profile saved for this product is no longer on your Etsy shop\./);
});
