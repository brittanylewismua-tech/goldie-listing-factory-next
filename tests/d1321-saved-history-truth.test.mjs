import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const history=fs.readFileSync(new URL("../app/batches/page.tsx",import.meta.url),"utf8");

test("Batch History does not promise that externally deleted Printify drafts still exist",()=>{
  assert.doesNotMatch(history,/Printify drafts you already created will still be there/);
  assert.match(history,/The Listing Factory checks that its Printify drafts still exist/);
});
