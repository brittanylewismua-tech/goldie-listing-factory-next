import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";


test("D1691: a clear result does not say the same words twice", () => {
  const page = readFileSync(new URL("../app/trademark/page.tsx", import.meta.url), "utf8");
  const verdict = page.slice(page.indexOf('className={`tm-verdict'));
  /*
    The badge carries the verdict and the headline carries what to do about it
    — "High risk" → "Do not print this". A clear result has no instruction to
    give, and the only thing that would fill the slot is encouragement to go
    ahead, which a screening tool cannot give.
  */
  assert.match(verdict, /verdict\.risk !== "clear" && \(/,
    "a clear result must not repeat its own badge as its headline");
  const headline = verdict.slice(verdict.indexOf('className="tm-headline"'),
    verdict.indexOf('className="tm-phrase"'));
  assert.doesNotMatch(headline, /Nothing found/);
  assert.match(headline, /Do not print this/);
  assert.match(headline, /Somebody owns part of this/);
});

test("D1691: a clear result never encourages printing", () => {
  const page = readFileSync(new URL("../app/trademark/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page,
    /safe to (print|use|sell)|good to go|you can print|clear to print/i);
});
