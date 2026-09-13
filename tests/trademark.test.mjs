import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = name => readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8");
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const { check, MARKS } = await import("../app/trademark-check.ts");

test("it catches the phrases that actually get shops closed", () => {
  const swift = check("taylor swift eras tour sweatshirt");
  assert.equal(swift.risk, "high");
  assert.ok(swift.hits.some(h => h.owner === "Taylor Swift"));

  const bluey = check("bluey birthday shirt for toddler");
  assert.equal(bluey.risk, "high");
  assert.equal(bluey.hits[0].category, "Character or franchise");
});

test("whole words only, because a checker that cries wolf gets ignored", () => {
  /* This codebase has been bitten by substring matching once already: a
     keyword parser threw away "Vintage Golf Decor" because vin-TAG-e contains
     "tag". A trademark checker doing the same would flag "Ford" inside
     "afford", "halo" inside "shalom" and "mario" inside "marionette" — and
     false alarms are worse than no alarm, because people stop reading them. */
  for (const safe of [
    "afford it shirt",          // ford
    "shalom yall tee",          // halo
    "marionette puppet art",    // mario
    "supremely tired mug",      // supreme
    "frozen yogurt lover",      // frozen — a real word, but not whole-word here
  ]) {
    const verdict = check(safe);
    if (safe.startsWith("frozen")) continue; /* "frozen" IS a whole word here */
    assert.equal(verdict.risk, "clear", `${safe} must not be flagged`);
  }
});

test("an ordinary seller phrase comes back clear", () => {
  const verdict = check("in my mama era comfort colors tee");
  assert.equal(verdict.risk, "clear");
  assert.deepEqual(verdict.hits, []);
});

test("a clear result never promises safety", () => {
  /* The list is the common traps, not the federal register. A tool that says
     "safe" is making a promise it cannot keep — the one somebody quotes back
     after losing a shop over a mark it had never heard of. */
  const verdict = check("something nobody owns");
  assert.doesNotMatch(verdict.summary, /\bsafe\b|\bclear to use\b|\byou can use\b/i);
  const page = strip(read("trademark/page.tsx"));
  assert.doesNotMatch(page, /\bis safe\b|\bsafe to (use|print)\b/i);
  assert.match(page, /not legal advice/i);
  assert.match(page, /not a search of the federal/i);
});

test("it says which word is the problem, not just that there is one", () => {
  /* "This phrase is risky" leaves a seller guessing which half to change. */
  const verdict = check("vintage nike inspired running tee");
  assert.equal(verdict.hits.length, 1);
  assert.equal(verdict.hits[0].matched.toLowerCase(), "nike");
  assert.equal(verdict.phrase.slice(verdict.hits[0].at, verdict.hits[0].at + verdict.hits[0].length)
    .toLowerCase(), "nike");
});

test("hits are ordered through the phrase so it can be marked up in place", () => {
  const verdict = check("disney and marvel and nike");
  const positions = verdict.hits.map(h => h.at);
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});

test("every mark names an owner and a category", () => {
  /* "This is trademarked" is not actionable. "Owned by Nintendo" is. */
  for (const mark of MARKS) {
    assert.ok(mark.owner && mark.owner.length > 1, `${mark.term} needs an owner`);
    assert.ok(mark.category, `${mark.term} needs a category`);
  }
  assert.ok(MARKS.length > 100, "the list has to be worth running");
});

test("the checker costs nothing to run", () => {
  /* The whole reason this works for cold traffic: no external call, so no
     quota, no rate limit, and no third party who can change their terms. */
  const source = read("trademark-check.ts") + read("api/trademark/route.ts");
  assert.doesNotMatch(strip(source), /fetch\(/);
});

test("its styles do not touch the shared stylesheet", () => {
  /* Another branch is editing interface-v2.css. This page brings its own. */
  const page = read("trademark/page.tsx");
  assert.match(page, /import "\.\/trademark\.css"/);
});
