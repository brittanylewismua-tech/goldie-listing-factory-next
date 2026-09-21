import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

test("D1303 keeps one focused-editor blocker and action in the footer", () => {
  assert.doesNotMatch(app, /Finish this before Review/);
  assert.doesNotMatch(app, /className="review-gate-action"/);
  assert.match(app, /issues\[0\]\|\|"Every listing is ready for review"/);
  assert.match(app, /canOpenPricing\?"Review item prices":"Review batch"/);
});
