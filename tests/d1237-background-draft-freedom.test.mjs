import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("D1237: navigation becomes safe only after the whole draft submission is admitted",()=>{
  const app=read("app/listing-factory-app.tsx");
  const queue=app.slice(app.indexOf("async function queueDraftSubmission()"),app.indexOf("function confirmDrafts()"));
  assert.ok(queue.indexOf("result.accepted!==requests.length")<queue.indexOf("setDraftsAdmitted(true)"));
  assert.match(app,/if\(!running\|\|draftsAdmitted\)return;event\.preventDefault\(\)/);
  assert.match(app,/if \(!\(running&&!draftsAdmitted\) && batchSaveStatus!=="saving"/);
  assert.match(app,/running&&!draftsAdmitted&&uploadNoticeOpen/);
  assert.match(app,/finally\{setRunning\(false\);setDraftsAdmitted\(false\)/);
  assert.match(app,/runDrafts\(remaining,true,true\)/);
});

test("draft creation keeps one inline progress surface after admission",()=>{
  const wait=read("app/wait-progress.tsx");
  assert.match(wait,/if\(!active\|\|helpOpen\|\|!dialog\.current\)return/);
  assert.doesNotMatch(wait,/if\(active\.background\).*goldie-background-progress/s);
  assert.match(wait,/Continue while drafts are created/);
  assert.match(wait,/Start another batch/);
  assert.match(wait,/View Batch History/);
  assert.match(wait,/containModalFocus\(active\.title,opener\)/);
  const app=read("app/listing-factory-app.tsx");
  assert.match(app,/observeTools=\{!\(running\|\|Boolean\(bundleRun\)\)\}/);
  assert.match(app,/creatingEtsyDrafts\|\|running\|\|bundleRun\?null/);
  assert.match(app,/className="batch-progress" role="status" aria-live="polite"/);
  assert.match(app,/processed===runTotal&&runTotal>0\?"Saving your finished batch"/);
});

test("D1237: Batch History automatically reports server-confirmed creation progress",()=>{
  const page=read("app/batches/page.tsx");
  assert.match(page,/batch\.status==="processing"/);
  assert.match(page,/setInterval\(\(\)=>void loadHistory\(true\),3000\)/);
  assert.match(page,/View progress/);
  assert.match(page,/This page updates automatically\. You can work elsewhere and return anytime\./);
  const route=read("app/api/batches/route.ts");
  assert.match(route,/const aggregateStatus=.*"needs_attention".*childrenComplete\?"complete".*"processing"/s);
});
