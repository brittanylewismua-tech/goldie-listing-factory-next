import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D922: a listing can show only one title-building workflow at a time",()=>{
  assert.match(source,/openMode,setOpenMode.*useState<"ai"\|"manual"\|null>/);
  assert.match(source,/open=\{openMode==="ai"\}/);
  assert.match(source,/IndividualManualTitle open=\{openMode==="manual"\}/);
  assert.match(source,/opened\?"ai":current==="ai"\?null:current/);
  assert.match(source,/opened\?"manual":current==="manual"\?null:current/);
});
