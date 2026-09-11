import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("public Etsy reads send the complete app credential", () => {
  for (const path of ["app/pod-drop.ts", "app/api/whats-selling/route.ts"]) {
    const source = read(path);
    assert.match(source, /etsyApiCredential/);
    assert.doesNotMatch(source, /headers:\s*\{\s*"x-api-key":\s*apiKey\(\)/);
  }
});

test("a failed first drop read is actionable instead of looking stuck", () => {
  const route = read("app/api/drop/route.ts");
  const page = read("app/drop/page.tsx");
  assert.match(route, /unavailable:\s*unavailable && categories\.length === 0/);
  assert.match(page, /Today&apos;s listings couldn&apos;t load/);
  assert.match(page, /window\.location\.reload\(\)/);
  assert.match(page, /role="alert"/);
});
