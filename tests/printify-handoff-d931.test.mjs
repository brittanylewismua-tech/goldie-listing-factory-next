import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const review=await readFile(new URL("../app/final-listing-review.tsx",import.meta.url),"utf8");
const route=await readFile(new URL("../app/api/printify/drafts/publish/route.ts",import.meta.url),"utf8");
const worker=await readFile(new URL("../worker/index.ts",import.meta.url),"utf8");
const operations=await readFile(new URL("../app/api/operations/route.ts",import.meta.url),"utf8");
const buildCommit=await readFile(new URL("../build/build-commit.ts",import.meta.url),"utf8");

test("D931: the final action hands the seller to Printify without publishing",()=>{
  assert.match(app,/href=\{handoffBlockers\(\)\.length\?undefined:"https:\/\/printify\.com\/app\/products"\}/);
  assert.match(app,/aria-disabled=\{handoffBlockers\(\)\.length>0\}/);
  assert.match(app,/Open My Products <span aria-hidden="true">↗<\/span>/);
  assert.match(app,/Nothing has been published to Etsy, and no Etsy listing fees have been charged/);
  assert.match(app,/Nothing publishes until you choose it in Printify/);
  assert.match(app,/<FactoryFooter status=\{handoffBlockers\(\)\[0\]/);
  assert.match(app,/<FinalListingReview handoffOnly/);
  assert.match(review,/handoffOnly\?"Review the drafts created for this batch"/);
  assert.match(review,/!handoffOnly&&<label className="final-select-all"/);
});

test("D931: every server-side route fails closed and no worker drains the queue",()=>{
  assert.match(route,/GOLDIE_ETSY_PUBLISHING_ENABLED=false/);
  assert.match(route,/if\(!GOLDIE_ETSY_PUBLISHING_ENABLED\)return NextResponse\.json\([\s\S]*?status:410/);
  const getBody=route.slice(route.indexOf("export async function GET"));
  assert.doesNotMatch(getBody,/drainGlobalPublishQueue\(/);
  assert.doesNotMatch(worker,/kickGlobalPublishQueueIfDue|drainGlobalPublishQueue/);
  assert.match(operations,/\["resume","retry_failed","run_now"\][\s\S]*?status:410/);
});

test("D931: a stale CI variable cannot overwrite the commit actually being built",()=>{
  assert.ok(buildCommit.indexOf('execSync("git rev-parse HEAD"')<buildCommit.indexOf("for (const name of CI_COMMIT_VARIABLES)"));
});
