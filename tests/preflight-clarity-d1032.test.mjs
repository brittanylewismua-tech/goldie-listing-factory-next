import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const modal=app.slice(app.indexOf('<h2 id="preflight-title">'),app.indexOf('</section></div>}',app.indexOf('<h2 id="preflight-title">')));

test("draft confirmation contains only the decisions needed to continue",()=>{
  assert.match(modal,/Nothing publishes yet/);
  assert.match(modal,/Saved Printify colors and sizes/);
  assert.match(modal,/Review previews, prices, and shipping/);
  assert.doesNotMatch(modal,/Permanent description|Plan allowance|Inside-label artwork|Primary artwork makes/);
  assert.equal((modal.match(/<div><span>/g)||[]).length,4);
});

test("final price approval persists to its original product even when a bundle product is switched",()=>{
  assert.match(app,/await persistBatchNow\(sourceBatchId,\{\.\.\.sourceSnapshot,drafts:nextDrafts\.map\(snapshotDraft\),pricingApproved:true\}\)/);
  assert.match(app,/const byId=new Map\(saved\.map\(draft=>\[draft\.id,draft\]\)\),nextDrafts=drafts\.map/);
});

test("an automatic product-default retry never interrupts the active batch",()=>{
  assert.match(app,/if\(key!=="auto-defaults"\)stopWith\("This default was not saved\."/);
});
