import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const app=await readFile(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const shell=await readFile(new URL("../app/factory-shell.tsx",import.meta.url),"utf8");
const css=await readFile(new URL("../app/interface-v2.css",import.meta.url),"utf8");

test("D932: final-review language cannot imply Goldie performs the publish",()=>{
  assert.match(app,/"Listing photos","Final review"/);
  assert.match(app,/className="publish-box-eyebrow">Etsy shop</);
  assert.doesNotMatch(app,/className="publish-box-eyebrow">Publishing to</);
});

test("D932: goal progress is withheld until its authoritative history arrives",()=>{
  for(const source of [app,shell]){
    assert.match(source,/goalDaysLoaded/);
    assert.match(source,/goalDaysLoaded\s*&&\s*<a className="listing-goal-side"/);
  }
});

test("D932: a bundle caption cannot leak onto unrelated workflow screens",()=>{
  assert.doesNotMatch(css,/recipe-icon::after\{content:"products in this bundle"/);
});
