import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");
const wait=readFileSync(new URL("../app/wait-progress.tsx",import.meta.url),"utf8");

test("color artwork rendering follows state while the file picker keeps its locked target",()=>{
  assert.match(app,/const focused=colors\.find\(color=>color\.id===activeColor\)\|\|colors\[0\]/);
  assert.doesNotMatch(app,/const focused=artworkUploadColor\.current/);
  assert.match(app,/const locked=artworkUploadColor\.current\|\|focused/);
  assert.match(app,/onClickCapture=\{event=>\{if\(\(event\.target as HTMLElement\)\.closest\("\.draft-color-artwork-action"\)\)artworkUploadColor\.current=focused\}\}/);
});

test("the wait clock has a deterministic first render",()=>{
  assert.match(wait,/const \[now,setNow\]=useState\(started\)/);
  assert.doesNotMatch(wait,/useState\(Date\.now\(\)\)/);
  assert.match(wait,/setInterval\(\(\)=>setNow\(Date\.now\(\)\),1000\)/);
});
