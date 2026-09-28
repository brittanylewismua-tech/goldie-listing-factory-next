import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Research saved niche count appears only after the library finishes loading",()=>{
  const source=readFileSync("app/market-watch/research/research-client.tsx","utf8");
  assert.match(source,/Your niches \{!savedLoading&&<span>\{saved\.length\}<\/span>\}/);
  assert.doesNotMatch(source,/Your niches <span>\{saved\.length\}<\/span>/);
});
