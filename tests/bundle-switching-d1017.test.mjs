import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../app/listing-factory-app.tsx",import.meta.url),"utf8");

test("D1017: opening an older bundle child cannot forget newer child links",()=>{
  const fn=app.slice(app.indexOf("function openBundleProduct(index:number)"),app.indexOf("async function continueBundle"));
  assert.match(fn,/const knownBatchIds=\{\.\.\.bundleBatchIds\}/);
  assert.match(fn,/await restoreBatchById\(existing,workflowStep,finishPhase,true\)/);
  assert.match(fn,/setBundleBatchIds\(current=>\(\{\.\.\.current,\.\.\.knownBatchIds\}\)\)/);
});

test("D1017: an acknowledged print-quality warning stops asking",()=>{
  assert.match(app,/const allBundleQualityGroups=useMemo/);
  assert.match(app,/const bundleQualityGroups=allBundleQualityGroups\.filter\(group=>!qualityGroupDecision\(group\.keys\)\)/);
  assert.match(app,/belowRecommendedPixels\.length>0&&bundleQualityGroups\.length>0/);
});
