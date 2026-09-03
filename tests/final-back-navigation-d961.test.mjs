import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

test("D961: Back from Final review returns to the rendered Listing screen", () => {
  const start = app.indexOf("async function goBackOneStep()");
  const end = app.indexOf("function canOpenStep", start);
  const back = app.slice(start, end);
  assert.match(back, /setFinishPhase\("details"\);\s*goToStep\("finish",false,true\)/);
  assert.doesNotMatch(back, /setFinishPhase\([^\n]*"mockups"/);
  assert.doesNotMatch(back, /setFinishPhase\([^\n]*"etsy"/);
});

test("D961: no visible workflow entry point sends a seller to the retired mockups phase", () => {
  const withoutRestore = app.replace(/setFinishPhase\(restoredFinishPhase[\s\S]*?\);setBulkTitles/, "setBulkTitles");
  assert.doesNotMatch(withoutRestore, /setFinishPhase\("mockups"\)/);
});
