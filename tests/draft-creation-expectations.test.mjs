import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("draft creation tells the seller the consequence before it starts",()=>{
  assert.match(app,/Nothing publishes yet\./);
  assert.match(app,/className="preflight-timing"/);
});

test("draft creation reports a live count instead of looking hung",()=>{
  assert.match(app,/Creating drafts · \$\{processed\} of \$\{runTotal\} finished/);
});

test("the Printify photo limit names current photo sources",()=>{
  assert.match(app,/Photos you upload and a size guide already chosen for this listing count toward that limit/);
  assert.doesNotMatch(app,/Lifestyle mockups and a size guide already chosen/);
});
