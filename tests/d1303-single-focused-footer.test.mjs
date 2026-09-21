import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

test("Focused editors keep one return; sequential listing stages have one next action", () => {
  assert.doesNotMatch(app, /Finish this before Review/);
  assert.doesNotMatch(app, /className="review-gate-action"/);
  assert.match(app, /!reviewEditing&&<FactoryFooter status=\{savingEtsyDetails/);
  assert.match(app, /finishPhase==="details"\?<button[^]*?Continue to Etsy details/);
  assert.match(app, /Continue to photos/);


});
