import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=fs.readFileSync(new URL("../app/api/printify/drafts/route.ts",import.meta.url),"utf8");

test("D1068 uploads independent artwork files concurrently",()=>{
  assert.match(route,/Promise\.all\(requestedArtworks\.map\(async \(artwork\)/);
  assert.doesNotMatch(route,/const uploadAllArtwork = async \(\) => \{\s*for \(const artwork of requestedArtworks\)/);
});

test("D1068 records and returns exact draft request timing",()=>{
  assert.match(route,/const requestStartedAt = performance\.now\(\)/);
  assert.match(route,/message:`total_ms=\$\{totalMs\}`/);
  assert.match(route,/"Server-Timing":`draft;dur=\$\{totalMs\}`/);
});
