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
  /* Wording unified with the other failure state on this page — one spelling
     of one error. The guarantee this test exists for is unchanged: a first
     read that fails says so and offers a retry, rather than sitting on a
     spinner forever. */
  assert.match(page, /Today&apos;s listings could not be loaded/);
  assert.match(page, /window\.location\.reload\(\)/);
  assert.match(page, /role="alert"/);
});
