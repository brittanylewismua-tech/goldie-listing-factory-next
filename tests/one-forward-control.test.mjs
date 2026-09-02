/* D615 - exactly one forward control, and it belongs to the open step.

   Found in the acceptance walkthrough: at step 3 the page contained TWO enabled
   "Next step" buttons. The second lived inside the collapsed Connect panel and
   navigated back to Product. It rendered on `connected && etsyConnected`, which
   stays true for the rest of the batch, so it sat there for every later step.

   Measured live: that button was inside .hidden-panel - width 0, height 0,
   offsetParent null - so a seller could not actually press it, and display:none
   also removes it from the accessibility tree. It was not reachable.

   It is still wrong. An enabled control that navigates backward should not exist
   at all, and only a CSS regression separates "hidden" from "live". A forward
   action belongs to the step that owns it. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

test("the connect step's forward control renders only on the connect step", () => {
  assert.match(app, /\{workflowStep==="connect"&&\(localPreview\|\|\(connected&&etsyConnected\)\)&&<FactoryFooter status=[\s\S]*?><button className="workflow-next"/);
});

test("the product step's forward control renders only on the product step", () => {
  /* D728 · The control now sits in the step's footer bar (prototype
     .goldie-footer). Its condition is unchanged and still guards the button:
     product step, a chosen template, a selected product. */
  assert.match(app, /\{workflowStep==="setup"&&templateDetails&&productSelected&&<FactoryFooter status=\{productStepBlocker\(\)\|\|"Product selected"\}><button type="button" className="workflow-next setup-forward"/);
});

test("no forward control survives inside the connect or product panel", () => {
  /* Scoped deliberately. A blanket source rule over every workflow-next passes by
     luck - the other forward controls live inside step-owned panels and are
     guarded further up than any fixed lookback would catch. What regressed was
     these two, so these two are what get pinned.

     The runtime invariant - exactly one ENABLED forward control on screen - is a
     DOM property and is verified live against the deployed page, not inferred
     from source text. */
  const connectPanel = app.slice(app.indexOf("step-card connect-step workflow-panel"), app.indexOf("product-step workflow-panel"));
  for (const match of connectPanel.matchAll(/className="workflow-next[^"]*"/g)) {
    const before = connectPanel.slice(0, match.index);
    assert.match(before.slice(-220), /workflowStep==="connect"/,
      "a forward control in the Connect panel must require the Connect step");
  }
  const setupPanel = app.slice(app.indexOf("product-step workflow-panel"), app.indexOf("designs-step workflow-panel"));
  for (const match of setupPanel.matchAll(/className="workflow-next[^"]*"/g)) {
    const before = setupPanel.slice(0, match.index);
    assert.match(before.slice(-220), /workflowStep==="setup"/,
      "a forward control in the Product panel must require the Product step");
  }
});

test("no forward control navigates to an earlier step from a later one", () => {
  // The connect button goes to "setup"; it must now be unreachable past connect.
  const connect = app.slice(app.indexOf('goToStep("setup",false,localPreview)') - 260, app.indexOf('goToStep("setup",false,localPreview)'));
  assert.match(connect, /workflowStep==="connect"/);
});
