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
  /* D379 · The restore body is now a function called two ways — on mount from
     the URL, and in place when a product card is opened — so the requested phase
     arrives as a parameter rather than being read from the URL inside. The rule
     is unchanged: honour what was asked for. */
  /* D428 · A friendly step name can imply a phase — ?step=publish means the
     Publish phase — so an explicit ?phase= still wins and the alias only fills
     the gap. The rule is unchanged: honour what was asked for. */
  assert.match(source, /setFinishPhase\(restoredFinishPhase\(state\.finishPhase\|\|"details",requestedPhase\?\?requestedFinishPhase\(requestedStep\),Boolean\(state\.complete\)\)\)/,
    "Restoration must honour the requested phase, not overwrite it with the saved one.");
  assert.match(source, /void restoreBatchById\(id,url\.searchParams\.get\("step"\),url\.searchParams\.get\("phase"\)\)/,
    "and on mount the URL is still what gets honoured");
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
  /* D623 widened this function - it now also refuses any value that is not a
     step at all - so the assertion is on what it must still do, not on the one
     line it used to be. */
  assert.match(source, /function normalizeStep\(step:WorkflowStep\):WorkflowStep\{[\s\S]*?==="review"\?"designs":/,
    "normalizeStep must still send review to designs");
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
  /* D853 · The gate now only applies to a stage AHEAD of the seller. `!active`
     still leads it, which is what this assertion is about: the stage she is
     standing on is never disabled. */
  assert.match(source, /disabled=\{!active&&ahead&&Boolean\(issues\.length\)\}/);
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

  /* Every condition in `disabled` needs a matching branch in the label. */
  const disabled = /disabled=\{([^}]*)\}/.exec(launch)[1];
  for (const condition of ["ready", "running", "preparingEtsy"]) {
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
  /* D363 · The button no longer carries an `approved` branch — once approved
     there is nothing to approve, so that state renders as a state and the button
     is not there at all. Every reason it can be DISABLED still has to be named,
     which is what D229 is about. */
  const button = source.slice(source.indexOf('className="pricing-approval-button"'));
  const label = button.slice(0, button.indexOf("</button>"));

  assert.match(label, /customDirty\?"Save or discard your custom profile to continue"/);
  assert.match(label, /!selectedProfile\?"Choose a shipping profile to continue"/);

  const disabled = /disabled=\{([^}]*)\}/.exec(button)[1];
  for (const condition of ["selectedProfile", "customDirty"]) {
    assert.ok(disabled.includes(condition));
    assert.ok(label.includes(condition), `${condition} must be reflected in the label`);
  }

  /* And a profile that has disappeared from the shop is called out. */
  assert.match(source, /No matching Etsy shipping profile was found for this product\./);
});

test("D231: a saved shipping profile that is not on the shop is treated as unset", async () => {
  const source = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* Measured live: Gildan Hoodie and gildan crewneck both held 259760087290 as
   * their etsyShippingProfileId. That number is the PRINTIFY shippingTemplateId
   * for the product — a Printify id stored in a field meant for an Etsy profile
   * id — so it matched none of the 94 profiles on the shop. The picker showed
   * nothing selected, the approval button was disabled, and the batch could not
   * move forward from either screen.
   *
   * An id that cannot resolve is worse than no id: it looks configured and
   * behaves broken. It resolves to unset, so the picker asks and D229 explains. */
  assert.match(
    source,
    /setEtsyShippingProfileId\(current=>current&&!etsyShippingProfiles\.some\(profile=>profile\.id===current\)\?0:current\)/,
  );

  /* The template id may only be adopted when it IS a real Etsy profile. */
  assert.match(
    source,
    /if\(!templateProfileId\|\|!etsyShippingProfiles\.some\(profile=>profile\.id===templateProfileId\)\)return;/,
  );
});

/* D376 · Resuming a finished batch from Batch History showed a page with a
   header, a rail, a Back link and nothing at all in between.
   finishPhase was "mockups" — a phase that has no renderer. Choosing the mockup
   set moved onto step 2 in D238, but "mockups" stayed in the type, stayed in
   the progress map, and stayed inside every batch saved before the move.
   Nothing drew it, so the workspace was empty.
   Verified against the live batch 9a78b187: status complete, step finish,
   finishPhase "mockups", three drafts, and a completely blank workspace. */
test("D376: every restored finish phase is one that actually renders", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* The renderable set must match what the JSX actually branches on. */
  assert.match(app, /const RENDERED_FINISH_PHASES:FinishPhase\[\]=\["details","etsy","final"\]/);
  /* D497 - publish now covers the whole bundle, so step 4 passes its action as a
     footer under the cards rather than as the open card's body. The banner still
     travels with that action; what changed is that it sits under every product
     card instead of inside one of them. */
  assert.match(app, /finishPhase==="final"&&stepProductCards\(bundleCardStatus\("publish"\),null,false,<>/,
    "step 4's action sits below every product card, not inside one");
  assert.match(app, /<article className="step-card final-review active-panel">/);
  /* D541 - step 3 used to pass one block holding everything; now its rows own
     panels the same way step 2's do, so the card body is null on all three. */
  assert.match(app, /\(finishPhase==="details"\|\|finishPhase==="etsy"\)&&stepProductCards\(bundleCardStatus\("listing"\),[\s\S]{0,600}?\bnull\b/,
    "step 3's card passes no body block");
  for (const task of ["titles", "description", "etsy"]) {
    assert.match(app, new RegExp(`if\\(task==="${task}"\\)return <`), `step 3 builds the ${task} panel`);
  }

  /* And nothing may branch on the dead phase. */
  assert.doesNotMatch(app, /finishPhase==="mockups"&&/,
    "if something renders mockups again, take it out of the dead list");

  /* Restoring must launder the saved value, not trust it. */
  assert.match(app, /const safeSaved=drawableFinishPhase\(saved,complete\)/);
  assert.match(app, /const target=drawableFinishPhase\(requested as FinishPhase,complete\)/);
});

test("a link written with the names on screen opens the right step — D428", async () => {
  const source = await (await import("node:fs/promises"))
    .readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  /* The rail says PRODUCT, IMAGES, LISTING, PUBLISH but the URL wanted setup,
     designs and finish, so ?step=listing was silently downgraded to the saved
     step — which reads as the app losing your place. */
  assert.match(source, /STEP_ALIASES:Record<string,WorkflowStep>=\{product:"setup",images:"designs",listing:"finish",titles:"finish",publish:"finish"\}/);
  assert.match(source, /function canonicalStep\(requested:string\|null\):WorkflowStep\|null\{/);
  // Both entry points - first load and browser back/forward - use the same map.
  assert.match(source, /const canonical=canonicalStep\(value\);if\(canonical\)setWorkflowStep\(normalizeStep\(canonical\)\)/);
  assert.match(source, /const target=canonicalStep\(requested\);\n  if\(!target\)return saved;/);
  // Emitted links are unchanged, so saved and shared URLs keep working.
  assert.match(source, /url\.searchParams\.set\("step",step\)/);
});

/* D544 · Walked her real batch end to end and hit a wall: step 3 prepared the
 * Etsy details, the rows read "Needs review", and there was no Next step button
 * anywhere on the page. Nothing to press, nothing explaining why.
 *
 * Cause: D221 decided Etsy details live on the Listing page with no phase of
 * their own, so continueToEtsyDetails() calls setFinishPhase("details") - and
 * then wrote phase=etsy into the URL anyway. Three things claimed to know which
 * phase step 3 was in and they disagreed: React state said details forever, the
 * URL said etsy, and a reload would restore etsy and behave differently again.
 * D541 then keyed the footer button on finishPhase==="details" and turned that
 * old inconsistency into a dead end. */
test("step 3 always has a way forward — D544", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  // One derived fact, asked once, from the data rather than from a phase name.
  assert.match(app, /const etsyDetailsPrepared=files\.length>0&&files\.every\(file=>Boolean\(file\.etsy\)\)/);

  /* The footer offers exactly one of the two, and which one depends on whether
     the work is done - so there is never a step 3 with neither. */
  /* D767 · Both branches sit in the step's footer row now, the same one every
     other step uses. The rule is unchanged: exactly one of the two, chosen by
     whether the work is done, so there is never a step 3 with neither. */
  const footer = app.slice(app.indexOf('{!etsyDetailsPrepared?<FactoryFooter'));
  assert.ok(footer.indexOf('className="workflow-next"') > 0, "the other branch is Next step");
  assert.ok(footer.indexOf('className="workflow-next"') < footer.indexOf("</FactoryFooter>}"), "in the same footer");

  // The URL is not allowed to claim a phase the app never enters.
  assert.doesNotMatch(app, /url\.searchParams\.set\("phase","etsy"\)/);
  assert.match(app, /url\.searchParams\.set\("phase","details"\)/);

  /* And nothing may go back to gating step 3's forward button on the phase,
     which is what made it unreachable. */
  assert.doesNotMatch(app, /\{finishPhase==="details"\?<>/);
});

/* D547 · Her three-product bundle ran correctly and step 4 said it hadn't.
 *
 * Read off her saved batches: 18:46:20 Gildan Hoodie, 18:46:35 Gildan Tee,
 * 18:46:45 gildan crewneck - two drafts each, all three complete. The run did
 * exactly what D485 promises. But bundleBatchIds is per batch and is written
 * when that batch is saved, so the hoodie's batch mapped 1 of 3, the tee's
 * mapped 2, and the crewneck's mapped 3. The batch she opens from is the first
 * one, which is the one that can see the least - so two finished products
 * reported "Not started yet" and step 4 offered to publish all three anyway. */
test("a bundle batch finds the products created after it — D547", async () => {
  const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  const at = app.indexOf("const bundleSiblingsScanned=useRef");
  assert.ok(at > 0, "the gap is filled by looking, not by trusting the map");
  const scan = app.slice(at, at + 2600);

  // It only looks when the map is genuinely short, and only once per bundle.
  assert.match(scan, /const missing=bundleRecipes\.filter\(recipe=>recipe\.id!==activeRecipe\?\.id&&!bundleBatchIds\[recipe\.id\]\)/);
  assert.match(scan, /if\(!missing\.length\)return/);
  assert.match(scan, /if\(bundleSiblingsScanned\.current===key\)return/);
  assert.match(scan, /bundleSiblingsScanned\.current=key/);

  /* A sibling is a batch that says it belongs to this bundle and this product,
     and that actually has drafts - an empty batch is not a finished product. */
  assert.match(scan, /if\(state\?\.activeBundle\?\.id!==activeBundle\.id\)continue/);
  assert.match(scan, /if\(!missing\.some\(recipe=>recipe\.id===recipeId\)\)continue/);
  assert.match(scan, /if\(!\(state\?\.drafts\|\|\[\]\)\.length\)continue/);

  // Anything already mapped wins: a look must never overwrite what the run knew.
  assert.match(scan, /setBundleBatchIds\(current=>\(\{\.\.\.found,\.\.\.current\}\)\)/);

  // And a failed look is not an error she has to see.
  assert.match(scan, /catch\{\/\* the cards already say/);
});

/* D623 · Every friendly URL D428 added crashed the entire app.
 *
 * Measured live on thegoldiesuite.com, batch 42a1ffb2, ?step=listing:
 *   TypeError: Cannot read properties of undefined (reading 'eyebrow')
 *   -> the error boundary, "Listing Factory hit a startup problem."
 *
 * D428 canonicalised the alias in the popstate reader and in batch restore, but
 * the D487 ref that remembers "the step she actually arrived on" read the raw
 * query value. Its effect then calls goToStep(wanted, true, true) - force skips
 * every guard - so "listing" was stored as the workflow step, and the hero
 * lookup workflowHero["listing"] came back undefined.
 *
 * This test runs the real functions rather than matching the fix, so it fails
 * for any alias that cannot survive the whole chain into a hero. */
test("every friendly step alias survives into a real hero — D623", async () => {
  const source = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  const aliases = source.match(/const STEP_ALIASES:Record<string,WorkflowStep>=\{[^}]+\}/)?.[0];
  const canonical = source.match(/function canonicalStep\(requested:string\|null\):WorkflowStep\|null\{[\s\S]*?\n\}/)?.[0];
  const normalize = source.match(/function normalizeStep\(step:WorkflowStep\):WorkflowStep\{[\s\S]*?\n  \}/)?.[0];
  assert.ok(aliases && canonical && normalize, "the step machinery must still be findable in source");

  const strip = (text) => text
    .replace(/:Record<string,WorkflowStep>/g, "")
    .replace(/\(requested:string\|null\):WorkflowStep\|null/g, "(requested)")
    .replace(/\(step:WorkflowStep\):WorkflowStep/g, "(step)")
    .replace(/:WorkflowStep\[\]/g, "")
    .replace(/ as WorkflowStep(\[\])?/g, "");
  const run = new Function(`${strip(aliases)};${strip(canonical)};${strip(normalize)};return {canonicalStep,normalizeStep}`)();

  // The hero object is the thing that was undefined. Take its real keys.
  const heroKeys = [...source.matchAll(/^\s{4}(connect|setup|designs|review|finish):/gm)].map((match) => match[1]);
  assert.ok(heroKeys.includes("connect") && heroKeys.includes("finish"), "workflowHero keys must be readable");

  for (const asked of ["product", "images", "listing", "titles", "publish", "connect", "setup", "designs", "review", "finish", "LISTING", " publish "]) {
    const stored = run.normalizeStep(run.canonicalStep(asked));
    assert.ok(heroKeys.includes(stored), `?step=${asked} stored "${stored}", which has no hero and takes the app down`);
  }

  // Junk must land somewhere real too - force:true means no guard catches it.
  assert.ok(heroKeys.includes(run.normalizeStep(run.canonicalStep("nonsense") ?? "connect")));

  // And the ref that D487 reads must go through the map, not the raw URL.
  assert.match(source, /requestedStep\.current=canonicalStep\(new URL\(window\.location\.href\)\.searchParams\.get\("step"\)\)/,
    "the arrived-on step must be canonicalised at the point it is read");
  assert.doesNotMatch(source, /const asked=new URL\(window\.location\.href\)\.searchParams\.get\("step"\) as WorkflowStep\|null/,
    "the raw read is what broke it");
});

/* D624 · Measured on step 3 of her real batch: the product card's badge read
 * "Titles ready" in green, and the very first row inside that same card read
 * "2 of 2 titles · 0 of 2 with all 13 tags" in crimson behind a warning mark.
 * The badge counted titles only; the row counted titles and tags. A card that
 * says ready and not-ready about itself at once is the kind of thing a seller
 * reads as broken. */
test("the Listing card badge agrees with the row it summarises — D624", async () => {
  const source = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

  const badge = source.match(/if\(step==="listing"\)\{[\s\S]*?\n        \}/)?.[0] || "";
  assert.ok(badge, "the Listing badge branch must still be findable");

  // The row's own definition of done - both halves of it.
  /* D660 · The row was corrected in the other direction: thirteen tags is an
     optimisation Etsy never demands, and publishBlockers has never mentioned
     it, so the row no longer withholds "done" for it. What D624 protects is
     that the badge and the row AGREE - so the badge follows the row there
     rather than disagreeing again in reverse. */
  assert.match(source, /done:started&&counts\.designs>0&&counts\.titled===counts\.designs,advice:/,
    "titles decide done; the tag shortfall is advice on both the row and the badge");

  // So the badge may only say ready under the same two conditions.
  assert.match(badge, /file\.title\.trim\(\)/, "the badge must still count titles");
  assert.match(badge, /file\.tags\.length>=13/, "and it must count tags, which is what it was missing");
  /* D693 - the wording changed, the rule did not. "0 of 2 fully tagged" beside
     three green ticks read as a failure; the tone was already advice, the words
     were a deficit counter. What D624 protects is that the badge and the row
     agree, and they still do - both advisory, both about the same shortfall. */
  assert.match(badge, /if\(tagged<files\.length\)return \{label:`\$\{files\.length-tagged\} could use all 13 tags`,tone:"advice"\};/,
    "reported, but in the advice tone the row now uses");
  // A real blocker still outranks advice, so the badge never leads with it.
  assert.ok(badge.indexOf("Etsy details ready") < badge.indexOf('tone:"advice"'),
    "Etsy details are a blocker and must be reported before the tag shortfall");
  assert.doesNotMatch(badge, /\{label:"Titles ready",tone:"ready"\}/,
    "the old badge claimed readiness from titles alone");

  const readyLabels = [...badge.matchAll(/\{label:([^,]+),tone:"ready"\}/g)].map((match) => match[1]);
  assert.equal(readyLabels.length, 1, "exactly one branch may be the ready branch");
  // and it must be the branch that both counts have already passed
  const readyIndex = badge.indexOf('tone:"ready"');
  assert.ok(badge.indexOf("tagged<files.length") < readyIndex,
    "the tag shortfall must be reported before the ready branch can be reached");
});
