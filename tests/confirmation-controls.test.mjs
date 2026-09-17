/*
  CONFIRMATION CONTROLS THAT ACTUALLY ASK.

  Measured on the deployed build: `confirmAction` showed a dialog on Batch
  History and silently returned false inside the Listing Factory workflow —
  same call, same chunk on disk, reproducible, no console error. Every guarded
  control there was a button that did nothing, including "Reload saved batch
  here", which is the ONLY way out of a paused batch.

  D528 had already fixed one instance of this by moving the host into the root
  layout. It returned because the mechanism was a module-level variable, and a
  module-level variable is a singleton only while everyone shares one instance
  of the module. Nothing guarantees that.

  These assert the properties that survive whatever the bundler does.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP = new URL("../app/", import.meta.url).pathname;
const read = name => readFileSync(join(APP, name), "utf8");
const dialog = read("confirm-dialog.tsx");

test("a request does not depend on module instance identity", () => {
  assert.match(dialog, /export const CONFIRM_REQUEST_EVENT/);
  assert.match(dialog, /window\.dispatchEvent\(new CustomEvent\(CONFIRM_REQUEST_EVENT/);
  assert.match(dialog, /window\.addEventListener\(CONFIRM_REQUEST_EVENT/);
  assert.doesNotMatch(dialog, /^let announce/m,
    "a module-level holder is the thing that broke twice");
});

test("the host claims a request synchronously, inside the dispatch", () => {
  /* The caller has to know, before dispatch returns, whether anybody will
     answer — otherwise "nothing is mounted" and "the person is thinking"
     look identical. */
  const handler = dialog.slice(dialog.indexOf("const onRequest"), dialog.indexOf("window.addEventListener"));
  assert.match(handler, /detail\.handled = true/);
  assert.match(handler, /setPending\(detail\)/);
  assert.ok(handler.indexOf("detail.handled = true") < handler.indexOf("setPending(detail)"),
    "claim before rendering, so the claim cannot depend on a render");
});

test("missing confirmation infrastructure fails closed AND says so", () => {
  const request = dialog.slice(dialog.indexOf("export function confirmAction"),
    dialog.indexOf("export default function ConfirmHost"));
  assert.match(request, /if \(!detail\.handled\)/);
  assert.match(request, /once\(false\)/, "the action must not run");
  assert.match(request, /confirmationUnavailableMessage/, "and the person must be told");
  /* The notice states that nothing happened, because that is the fact that
     matters to somebody who just pressed a destructive button. */
  assert.match(dialog, /Nothing was changed\./);
  assert.match(dialog, /NOTHING WAS CHANGED/);
});

test("cancel is the default answer on every exit", () => {
  /* Escape, the backdrop, the close button and Cancel all mean no. */
  assert.match(dialog, /event\.key === "Escape"/);
  assert.match(dialog, /settle\(false\)/);
  assert.match(dialog, /autoFocus/, "focus lands on Cancel, not the destructive action");
  const settle = dialog.slice(dialog.indexOf("const settle ="));
  assert.match(settle, /pending\.resolve\(answer\); setPending\(null\)/);
});

test("a request settles exactly once", () => {
  /* A host answering after a fail-closed notice, or two hosts answering, must
     not resolve the same promise twice and run the action twice. */
  assert.match(dialog, /let settled = false/);
  assert.match(dialog, /if \(!settled\) \{ settled = true; resolve\(answer\) \}/);
});

test("two hosts mounting and one unmounting leaves reporting intact", () => {
  assert.match(dialog, /if \(reportUnavailable === setUnavailable\) reportUnavailable = null/,
    "an unmounting host must not disable the surviving one");
});

test("no guarded control reaches its action without awaiting the answer", () => {
  /* The bug was invisible because the call sites are correct: they all await.
     What broke was underneath them. This keeps them correct. */
  const files = [];
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name)) files.push(full);
    }
  };
  walk(APP);
  const offenders = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/(.{0,12})confirmAction\(/g))
      if (!/await |=> *$|return /.test(match[1]) && !file.endsWith("confirm-dialog.tsx"))
        offenders.push(`${file.slice(APP.length)}: ${match[1].trim()}confirmAction(`);
  }
  assert.deepEqual(offenders, [],
    `these use the answer without awaiting it: ${offenders.join(", ")}`);
});

test("the controls named in the audit are all guarded", () => {
  const app = read("listing-factory-app.tsx");
  /* Batch takeover — the one that was measurably dead. */
  assert.match(app, /function takeOverBatchHere\(\)\{\s*void reloadConflictedBatch\(\)/);
  assert.match(app, /async function reloadConflictedBatch\(\)\{\s*if\(!await confirmAction/);
  /* Removing a design that already has drafts behind it. */
  assert.match(app, /async function removeDesign/);
  /* Deleting from history, and disconnecting an account. */
  assert.match(read("batches/page.tsx"), /confirmAction/);
});
