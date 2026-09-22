import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";


test("D1691: a clear result does not say the same words twice", () => {
  const page = readFileSync(new URL("../app/trademark/page.tsx", import.meta.url), "utf8");
  const verdict = page.slice(page.indexOf('className={`tm-verdict'));
  /*
    The badge carries the verdict and the headline carries what to do about it
    — "High risk" → "Matches need review". A clear result has no instruction to
    give, and the only thing that would fill the slot is encouragement to go
    ahead, which a screening tool cannot give.
  */
  assert.doesNotMatch(verdict, /className="tm-headline"/, "do not repeat the verdict badge as another headline");
  assert.match(verdict, /No matching mark was found/);
  assert.match(verdict, /does not establish that the phrase is available/);
  assert.doesNotMatch(verdict, /Somebody owns part of this|Do not print this/);
});

test("D1691: a clear result never encourages printing", () => {
  const page = readFileSync(new URL("../app/trademark/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page,
    /safe to (print|use|sell)|good to go|you can print|clear to print/i);
});

test("D1693: no menu promises a complete register search", () => {
  /*
    The checker says "the trademark records currently loaded" and the register
    is still ingesting. A menu entry reading "the federal register" promises a
    completeness the page it opens does not claim.
  */
  const more = readFileSync(new URL("../app/more/page.tsx", import.meta.url), "utf8");
  const shown = more.match(/what: "[^"]*"/g) ?? [];
  for (const line of shown)
    assert.doesNotMatch(line, /federal register/i,
      `a menu entry claims a complete search: ${line}`);
  assert.match(more, /Check a phrase and watch for trademark changes\./);
});
