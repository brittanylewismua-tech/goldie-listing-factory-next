import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const stage=fs.readFileSync(new URL("../app/api/printify/stage/route.ts",import.meta.url),"utf8");

test("D1065 warms artwork staging as soon as designs are accepted",()=>{
  assert.match(app,/for\(const design of restoredAndNew\)void stagedArtwork\(`/);
  assert.match(app,/stagedArtworkCache=useRef\(new Map/);
  assert.match(app,/if\(cached\?\.file===artwork\.file\)/);
  assert.match(app,/expires>Date\.now\(\)\+60_000/);
});

test("D1065 reuses warmed staging during draft creation and consumes it once",()=>{
  assert.match(app,/await stagedArtwork\(`\$\{design\.id\}:\$\{item\.key\}`/);
  assert.match(app,/artworkItems\.forEach\(item=>stagedArtworkCache\.current\.delete/);
  assert.match(app,/key\.startsWith\(`\$\{design\.id\}:`\)/);
});

test("D1065 does not block staging on an unrelated abandoned-upload sweep",()=>{
  assert.match(stage,/void removeExpiredArtwork\(artwork\)/);
  assert.doesNotMatch(stage,/await removeExpiredArtwork\(artwork\)/);
});

test("D1065 creates up to four drafts concurrently",()=>{
  assert.match(app,/const MAX_CONCURRENT_DESIGNS = 4/);
  assert.match(app,/const batchConcurrency=MAX_CONCURRENT_DESIGNS/);
  assert.doesNotMatch(app,/LARGE_BATCH_THRESHOLD/);
});
