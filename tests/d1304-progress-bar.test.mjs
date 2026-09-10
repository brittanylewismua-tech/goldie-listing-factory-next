import test from "node:test";
import assert from "node:assert/strict";
import {
  laterDraftCreationPhase,
  measuredDraftCreationPercent,
  nextVisibleDraftCreationPercent,
} from "../app/draft-creation-progress.ts";
import { readFileSync } from "node:fs";

const route=readFileSync(new URL("../app/api/printify/drafts/route.ts",import.meta.url),"utf8");

test("D1304 reports each real provider phase without moving backward",()=>{
  assert.equal(laterDraftCreationPhase(undefined,"preparing"),"preparing");
  assert.equal(laterDraftCreationPhase("creating","uploaded"),"creating");
  assert.equal(laterDraftCreationPhase("uploaded","created"),"created");
  assert.match(route,/phase:job\?\.phase/);
});

test("D1304 aggregates real work across every listing",()=>{
  assert.equal(measuredDraftCreationPercent({},2),3);
  assert.equal(measuredDraftCreationPercent({a:"staged",b:"preparing"},2),16);
  assert.equal(measuredDraftCreationPercent({a:"creating",b:"uploaded"},2),67);
  assert.equal(measuredDraftCreationPercent({a:"succeeded",b:"succeeded"},2),100);
});

test("D1304 starts immediately, advances between provider checkpoints, and reserves 100 for completion",()=>{
  let visible=0;
  visible=nextVisibleDraftCreationPercent(visible,3,false);
  assert.equal(visible,1);
  for(let tick=0;tick<12;tick++)visible=nextVisibleDraftCreationPercent(visible,3,false);
  assert.ok(visible>3,"the conventional fill must keep moving while the current stage is active");
  for(let tick=0;tick<200;tick++)visible=nextVisibleDraftCreationPercent(visible,76,false);
  assert.equal(visible,94);
  assert.equal(nextVisibleDraftCreationPercent(visible,100,true),100);
});

test("D1305 keeps the production progress fill solid",()=>{
  const css=readFileSync(new URL("../app/approved-functional.css",import.meta.url),"utf8");
  assert.match(css,/\.app-shell \.progress-track span\{background:#b777b0!important\}/);
  assert.doesNotMatch(css,/progress-track span\{background:linear-gradient/);
});
