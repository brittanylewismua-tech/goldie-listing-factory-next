import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const route=readFileSync(new URL("../app/api/listing-intelligence/route.ts",import.meta.url),"utf8");

test("malformed or missing vision JSON falls back to reviewable Etsy details",()=>{
  assert.match(route,/function reviewFallback\(/);
  assert.match(route,/if\(!match\)return NextResponse\.json\(\{details:reviewFallback\(body\.product\)\}\)/);
  assert.match(route,/catch\{return NextResponse\.json\(\{details:reviewFallback\(body\.product\)\}\)\}/);
});
