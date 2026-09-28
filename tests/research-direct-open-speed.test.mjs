import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("opening a saved Research project does not wait for the library list",()=>{
  const source=readFileSync("app/market-watch/research/research-client.tsx","utf8");
  assert.match(source,/void loadSaved\(\);if\(id\)void open\(id\);else if\(keyword\)void fromKeyword\(keyword\)/);
  assert.doesNotMatch(source,/loadSaved\(\)\.then/);
});
