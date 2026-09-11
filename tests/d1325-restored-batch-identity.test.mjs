import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D1325: a restored batch keeps its history label in the header without turning it into a seller-entered name",()=>{
  assert.match(source,/const \[restoredBatchName,setRestoredBatchName\]=useState\(""\)/);
  assert.match(source,/setRestoredBatchName\(payload\.batch\.display_name\|\|""\)/);
  assert.match(source,/batchDisplayName\?\.trim\(\)\|\|restoredBatchName\.trim\(\)\|\|"New listing batch"/);
  assert.doesNotMatch(source,/setBatchDisplayName\(payload\.batch\.display_name/);
  assert.match(source,/setRestoredBatchName\(""\)/);
});

test("D1325: completed title work leads with editable listings instead of a disabled creation form",()=>{
  assert.match(source,/const titleSetsReady=files\.every\(item=>Boolean\(item\.title\.trim\(\)&&item\.tags\.length\)\)/);
  assert.match(source,/description=\{titleSetsReady\?"Review or change every listing below\."/);
  assert.match(source,/open=\{batchToolsOpen\?\?!titleSetsReady\}/);
  assert.match(source, /\{titleSetsReady\?"Create different titles and tags":"Create missing titles and tags"\}/);
  assert.match(source,/onToggle=\{event=>setBatchToolsOpen\(event\.currentTarget\.open\)\}/);
});

test("D1325: collapsed Etsy details name the selected category instead of saying nothing was added",()=>{
  assert.match(source,/return `\$\{details\.category\?\.trim\(\)\|\|"Choose an Etsy category"\} · \$\{propertyStatus\}`/);
  assert.equal((source.match(/etsyDetailsSummary\(details,properties\)/g)||[]).length,2);
  assert.doesNotMatch(source,/`\$\{completed\.length\} added · all optional`/);
});

test("D1325: partial bundle review offers a direct route to the unfinished product",()=>{
  assert.match(source,/function nextBundleProductToFinish\(\)/);
  assert.match(source,/className="review-bundle-recovery-button"/);
  assert.match(source,/`Finish \$\{recipe\.name\} →`/);
  assert.match(source,/onClick=\{\(\)=>openBundleProduct\(index\)\}/);
});
