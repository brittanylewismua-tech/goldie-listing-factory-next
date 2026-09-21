import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const handoff=readFileSync(new URL("../app/photo-delivery-handoff.tsx",import.meta.url),"utf8");
test("A late description autosave invalidates a previously completed Etsy receipt",()=>{
  assert.match(app,/savedRevision=\{JSON.stringify\(bundlePublishDrafts\(\).map\(draft=>\[draft.id,draft.title,draft.tags,draft.description,draft.etsyDetails,draft.selectedVariantIds\]/);
  const effect=handoff.slice(handoff.indexOf("const lastSavedRevision"),handoff.indexOf("useImperativeHandle" , handoff.indexOf("const lastSavedRevision")));
  assert.match(effect,/statusReads.current.invalidate\(\)/);
  assert.match(effect,/setStatusKnown\(false\)/);
  assert.match(effect,/polling.current=true;pollSchedule.current.next=0/);
});
test("Final text is taken from the product that owns each draft",()=>{
  assert.match(app,/const design=\(own\?files:member\?.designs\?\?\[\]\).find/);
  assert.match(app,/own\?description:member\?.description\?\?""/);
  assert.match(app,/beforePrepare=\{async\(\)=>\{await flushLatestListingFields\(\)/);
});
