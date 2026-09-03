import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../app/listing-factory-app.tsx", import.meta.url), "utf8");

test("D962: the final handoff reports the same whole bundle shown beside it", () => {
  const start = app.indexOf("function publishReports()");
  const end = app.indexOf("function listingGridScreen", start);
  const reports = app.slice(start, end);
  assert.match(reports, /reportFiles=bundlePublishFiles\(\),reportDrafts=bundlePublishDrafts\(\),reportSelections=bundlePublishSelections\(\),reportMockups=bundlePublishMockupCounts\(\)/);
  assert.match(reports, /drafts:createdReportDrafts\.length/);
  assert.match(reports, /titled:reportFiles\.filter/);
  assert.match(reports, /Approved for \$\{plural\(bundleRecipes\.length,"product"\)\}/);
  assert.doesNotMatch(reports, /drafts:drafts\.filter/);
  assert.doesNotMatch(reports, /titled:files\.filter/);
});
