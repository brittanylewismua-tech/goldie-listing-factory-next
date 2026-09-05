import {readDraftImplementation} from "./draft-implementation-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route=readDraftImplementation();

test("D1068 uploads independent artwork files concurrently",()=>{
  assert.match(route,/Promise\.all\(requestedArtworks\.map\(async \(artwork\)/);
  assert.doesNotMatch(route,/const uploadAllArtwork = async \(\) => \{\s*for \(const artwork of requestedArtworks\)/);
});

test("D1068 records durable execution time separately from HTTP admission",()=>{
  assert.match(route,/requestStartedAt=performance\.now\(\)/);
  assert.match(route,/message:`total_ms=\$\{totalMs\}`/);
  assert.match(route,/NextResponse.json\(\{status:"running"\},\{status:202\}\)/);
});
