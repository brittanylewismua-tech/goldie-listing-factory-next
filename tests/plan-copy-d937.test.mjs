import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const signup=await readFile(new URL("../app/signup/signup-client.tsx",import.meta.url),"utf8");
const usage=await readFile(new URL("../app/usage/page.tsx",import.meta.url),"utf8");

test("D937: public plan copy charges credits for Printify drafts, never an Etsy publish by Goldie",()=>{
  for(const source of [signup,usage]){
    assert.match(source,/unpublished Printify draft/);
    assert.match(source,/Goldie never publishes to Etsy/);
    assert.doesNotMatch(source,/Etsy listing successfully created by Goldie/);
  }
});

test("D937: the obsolete Etsy publishing limit is not presented as a live usage meter",()=>{
  assert.doesNotMatch(usage,/24-hour publishing safety limit/);
  assert.match(usage,/Monthly listing creations/);
});
