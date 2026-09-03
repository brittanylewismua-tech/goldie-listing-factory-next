import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = ["app/listing-factory-app.tsx", "app/factory-tools.tsx"]
  .map(file => fs.readFileSync(file, "utf8"))
  .join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

test("D964: workflow copy states outcomes without narrating the tool", () => {
  for (const pattern of [
    /Goldie (?:will|can|uses|keeps|checks|moves|creates|adds|does|never|is|has|selects|applies|publishes|fills)/i,
    /(?:with|in|from) Goldie\b/i,
  ]) {
    const match = source.match(pattern);
    assert.equal(match, null, `self-referential workflow copy remains: ${match?.[0]}`);
  }
});

test("D964: brand chrome remains while redundant workflow narration is gone", () => {
  assert.match(source, /<GoldieWordmark className="approved-brand"/);
  assert.doesNotMatch(source, /<GoldieInsight>/);
  assert.match(source, /Nothing is published automatically\./);
  assert.match(source, /Keep this page open\./);
});
