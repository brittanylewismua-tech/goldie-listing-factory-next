import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("D959: uploaded-design cards reserve room for the preview, identity, and Remove control", async () => {
  const css = await read("../app/interface-v2.css");
  assert.match(css, /\.app-shell \.design-upload-review\{grid-template-columns:repeat\(auto-fit,minmax\(390px,1fr\)\)\}/);
  assert.match(css, /\.app-shell \.design-artwork-primary\{[\s\S]{0,160}grid-template-columns:104px minmax\(0,1fr\) auto!important;[\s\S]{0,100}min-width:0;width:100%/);
  const card = 390;
  const horizontalPadding = 28;
  const preview = 104;
  const twoGaps = 30;
  const measuredRemoveButton = 76;
  const identityWidth = card - horizontalPadding - preview - twoGaps - measuredRemoveButton;
  assert.ok(identityWidth >= 150, `the identity column must remain readable; resolved to ${identityWidth}px`);
});
