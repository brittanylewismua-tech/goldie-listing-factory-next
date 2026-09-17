/*
  A CONFIDENT ANSWER TO A QUESTION NOBODY ASKED.

  Measured against production: "Vintage Tractor Parts Since 1947" scanned
  against the bachelorette niche returned output byte-for-byte identical to
  "Bride Squad Bachelorette Party" — same verdict ("Strong visual-pattern
  alignment"), same scope sentence, same supporting points, same evidence line.

  Nothing was broken. The scanner compares how a design is BUILT, and both were
  built identically. But a seller scans a design to find out whether it will
  sell into a niche, and "shares several visual construction patterns with
  listings currently showing verified momentum in this niche" reads as "yes".
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { relevanceOf, relevanceNotice } from "../app/design-niche-relevance.ts";
import { normalizeNiche } from "../app/niche-cohort.ts";

const terms = phrase => normalizeNiche(phrase).terms;

test("a design about the niche is on-subject", () => {
  const result = relevanceOf("Bride Squad Bachelorette Party", terms("bachelorette"));
  assert.equal(result.verdict, "on-subject");
  assert.deepEqual(result.matched, ["bachelorette"]);
  assert.equal(relevanceNotice(result, "bachelorette"), "",
    "an on-subject design needs no re-scoping");
});

test("a design about something else is off-subject", () => {
  const result = relevanceOf("Vintage Tractor Parts Since 1947", terms("bachelorette"));
  assert.equal(result.verdict, "off-subject");
  const notice = relevanceNotice(result, "bachelorette");
  assert.match(notice, /does not appear to be about bachelorette/);
  assert.match(notice, /how it is BUILT/,
    "the visual comparison must be re-scoped, not deleted — it is still true");
  assert.match(notice, /still not belong in the niche/);
});

test("any niche term is enough — calling a real design off-subject is the costly error", () => {
  /* The cohort rule requires EVERY term, because it decides what to compare
     against. This one only asks whether the design is plausibly on topic. */
  const result = relevanceOf("Dog Mom Life", terms("dog mom gifts"));
  assert.equal(result.verdict, "on-subject");
  assert.ok(result.matched.length >= 1);
});

test("artwork with no words says so rather than guessing either way", () => {
  const result = relevanceOf("", terms("halloween"));
  assert.equal(result.verdict, "unreadable");
  const notice = relevanceNotice(result, "halloween");
  assert.match(notice, /no readable text/);
  assert.match(notice, /not a judgement about whether the subject fits/);
});

test("the scan puts the re-scoping before the construction sentence", () => {
  const route = readFileSync(new URL(
    "../app/api/design-scanner/scan/route.ts", import.meta.url), "utf8");
  assert.match(route, /const relevance = relevanceOf\(String\(upload\?\.visibleWording \?\? ""\), terms\)/);
  assert.match(route, /scope: notice \? `\$\{notice\} \$\{alignment\.scope\}` : alignment\.scope/,
    "an off-subject design must be told so before the visual verdict");
  assert.match(route, /subject: \{ verdict: relevance\.verdict/,
    "the subject finding must be in the result, not only in prose");
});

test("the construction verdict is never deleted or softened", () => {
  /* It is true and useful. The fix is scoping it, not hiding it — a member
     with an off-subject design still learns their layout is sound. */
  const route = readFileSync(new URL(
    "../app/api/design-scanner/scan/route.ts", import.meta.url), "utf8");
  assert.match(route, /overall: alignment\.overall/);
  assert.match(route, /working: alignment\.working/);
});
