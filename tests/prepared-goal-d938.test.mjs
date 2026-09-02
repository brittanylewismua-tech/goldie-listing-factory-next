import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const [route,shell,app,goals,usage]=await Promise.all([
  readFile(new URL("../app/api/batches/route.ts",import.meta.url),"utf8"),
  readFile(new URL("../app/factory-shell.tsx",import.meta.url),"utf8"),
  readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8"),
  readFile(new URL("../app/goals/page.tsx",import.meta.url),"utf8"),
  readFile(new URL("../app/usage/page.tsx",import.meta.url),"utf8"),
]);

test("D938: the goal is counted from successful Printify drafts, not disabled Etsy publishing",()=>{
  assert.match(route,/FROM printify_draft_results WHERE user_id=\? AND status='succeeded'/);
  assert.match(route,/prepared:preparedDays,published:publishedDays/);
  for(const source of [shell,app,goals]) assert.match(source,/\.prepared/);
});

test("D938: every visible goal describes prepared listings",()=>{
  assert.match(shell,/of \{goal\.target\} prepared/);
  assert.match(app,/of \{listingGoal\.target\} prepared/);
  assert.match(goals,/prepared as a Printify draft/);
  assert.match(usage,/target for listings prepared as Printify drafts/);
  for(const source of [shell,app,goals,usage]) assert.doesNotMatch(source,/goal[^\n]{0,180}publish receipt/i);
});
