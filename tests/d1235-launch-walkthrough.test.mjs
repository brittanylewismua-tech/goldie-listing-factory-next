import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appUrl = new URL("../app/listing-factory-app.tsx", import.meta.url);

test("D1235: routine restores and Etsy-detail preparation stay inline", async () => {
  const app = await readFile(appUrl, "utf8");
  const wait = app.slice(app.indexOf("<WaitProgress observeTools"), app.indexOf("{/* D721 · Top bar", app.indexOf("<WaitProgress observeTools")));
  assert.doesNotMatch(wait, /savingEtsyDetails\?/,
    "preparing ordinary listing details must not open a blocking wait dialog");
  assert.doesNotMatch(wait, /restoringBatch\|\|switchingProduct\|\|loadingTemplate/,
    "saved-product reads already have inline states and must not interrupt the seller with a modal");
  assert.match(wait, /creatingEtsyDrafts\|\|running\|\|bundleRun\?null/,
    "draft creation uses its existing inline progress surface instead of a second dialog");
  assert.match(app, /className="batch-progress" role="status" aria-live="polite"/,
    "real provider draft creation remains explicit and accessible inline");
  assert.doesNotMatch(wait, /titleBuilding\|\|applyingBankToBundle/,
    "title generation uses its inline progress surface instead of a blocking dialog");
  assert.match(wait,/observeTools=\{!\(running\|\|Boolean\(bundleRun\)\|\|titleBuilding\)\}/,
    "generic busy-state observation is disabled while inline title progress is active");
  assert.match(app, /className={`title-generation-progress\$\{titleBuildProgress\.completed===0\?" is-starting":""\}`}/,
    "automatic titles expose immediate inline activity and real completion progress");
});

test("D1235: a failed listing explains the failure before recovery actions", async () => {
  const app = await readFile(appUrl, "utf8");
  const failed = app.slice(app.indexOf('<div className="task-listing failed"'), app.indexOf("<ArtworkGrid", app.indexOf('<div className="task-listing failed"')));
  assert.match(failed, /failed-listing-reason/);
  assert.match(failed, /role="alert"/);
  assert.match(failed, /draft\.error\|\|"This private Printify draft is no longer available\. Retry to create it again\."/);
  assert.ok(failed.indexOf("failed-listing-reason") < failed.indexOf("Retry this listing"),
    "the reason must appear before Retry and Get help");
});
