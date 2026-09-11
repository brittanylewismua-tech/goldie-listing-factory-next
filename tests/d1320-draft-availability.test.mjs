import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const route=readFileSync(new URL("../app/api/printify/drafts/verify/route.ts",import.meta.url),"utf8");

test("final Review checks every saved Printify draft before showing readiness",()=>{
  assert.match(app,/draftAvailabilityIds=bundlePublishDrafts\(\)/);
  assert.match(app,/\/api\/printify\/drafts\/verify/);
  assert.match(app,/bundleProductsStillReading\(\)\.length\|\|!draftAvailabilitySettled/);
  assert.match(app,/Checking every Printify draft/);
  assert.match(app,/setDrafts\(current=>current\.map\(draft=>draft\.id&&missing\.has\(draft\.id\)\?\{\.\.\.draft,status:"Failed"/);
  assert.match(app,/setBundleMembers\(current=>Object\.fromEntries/);
});

test("availability checks are owned, bounded, read-only provider requests",()=>{
  assert.match(route,/user_id=\? AND status='succeeded'/);
  assert.match(route,/slice\(0,80\)/);
  assert.match(route,/runBounded\(\[\.\.\.stored\.entries\(\)\],4/);
  assert.doesNotMatch(route,/method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
  assert.match(route,/response\.status===404/);
});
