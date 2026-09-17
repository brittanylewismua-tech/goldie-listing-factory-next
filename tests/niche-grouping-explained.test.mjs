/*
  THE GROUPING DECISIONS, IN A MEMBER'S WORDS.

  A shop whose listings suggest thirteen groupings is shown five. Without an
  explanation the only available conclusion is that something was lost, and
  the member cannot tell whether the judgement was right — let alone correct
  it.

  What this must NOT contain is as important: no prompts, no model names, no
  scores, no internal rule wording, no raw field values. A member needs to
  understand the decision and be able to disagree with it; none of the
  machinery helps with either, and all of it invites treating the output as
  more authoritative than it is.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { explainGrouping, plainList } from "../app/niche-grouping-explained.ts";

/* Exactly what the live shop produced. */
const LIVE = [
  { from: "Feminist Slogans", into: "Feminist", because: "a design format, not a different buyer" },
  { from: "Feminist Activism", into: "Feminist", because: "a design format, not a different buyer" },
  { from: "Feminist Icons", into: "Feminist", because: "a design format, not a different buyer" },
  { from: "Feminist Identity", into: "Feminist", because: "a design format, not a different buyer" },
  { from: "Feminist for Men", into: "Feminist", because: "the same subject, narrowed" },
  { from: "Feminist Wall Decor", into: "Feminist", because: "the same subject, narrowed" },
  { from: "Feminist Jewelry", into: "Feminist", because: "the same subject, narrowed" },
  { from: "Girls Tshirts", into: "", because: "only 1 listings" },
];

test("a list reads the way a person would say it", () => {
  assert.equal(plainList([]), "");
  assert.equal(plainList(["A"]), "A");
  assert.equal(plainList(["A", "B"]), "A and B");
  assert.equal(plainList(["A", "B", "C"]), "A, B and C");
  assert.equal(plainList(["A", "A", "B"]), "A and B", "repeats collapse");
});

test("same-audience groupings say why, in the member's terms", () => {
  const notes = explainGrouping(LIVE);
  const sentence = notes.map(note => note.sentence)
    .find(text => /differ mainly by design style/.test(text));
  assert.ok(sentence, "the design-style reason is missing");
  assert.match(sentence,
    /Feminist Slogans, Feminist Activism, Feminist Icons and Feminist Identity were grouped under Feminist because they reach the same shoppers and differ mainly by design style\./);
});

test("a target that absorbed two kinds of thing says both", () => {
  const notes = explainGrouping(LIVE).filter(note => note.kind === "grouped");
  assert.equal(notes.length, 2, "one sentence per reason, not one averaged sentence");
  assert.ok(notes.some(note => /narrower form/.test(note.sentence)));
  assert.match(notes.find(note => /narrower form/.test(note.sentence)).sentence,
    /Feminist for Men, Feminist Wall Decor and Feminist Jewelry were grouped under Feminist because they are the same subject in a narrower form\./);
});

test("what was left out is said once, and not as a fault", () => {
  const left = explainGrouping(LIVE).find(note => note.kind === "left-out");
  assert.ok(left);
  assert.match(left.sentence, /Girls Tshirts was not shown as a niche of its own/);
  assert.match(left.sentence, /too few listings sat in it to tell yet/);
  /* And the member is told the listings are not lost. */
  assert.match(left.sentence, /Its listings are counted in whichever niche they best fit\./);
});

test("singular and plural both read correctly", () => {
  const one = explainGrouping([
    { from: "Feminist Icons", into: "Feminist", because: "a design format, not a different buyer" },
  ]);
  assert.match(one[0].sentence, /^Feminist Icons was grouped under Feminist/);
  const many = explainGrouping([
    { from: "A", into: "", because: "only 1 listings" },
    { from: "B", into: "", because: "only 2 listings" },
  ]);
  assert.match(many[0].sentence, /A and B were not shown as niches of their own/);
  assert.match(many[0].sentence, /sat in them/);
  assert.match(many[0].sentence, /Their listings are counted/);
});

test("no machinery reaches the sentences", () => {
  const notes = explainGrouping(LIVE).map(note => note.sentence).join(" ");
  /* The internal reason wording, the counts it was derived from, and the
     vocabulary a member has no use for. */
  for (const leak of ["buyer", "only 1 listings", "confidence", "prompt", "model",
    "facet", "canonical", "classifier", "score"])
    assert.ok(!new RegExp(leak, "i").test(notes), `the explanation leaks "${leak}"`);
});

test("an unrecognised reason is not passed through verbatim", () => {
  /* Its wording is not written for anybody to read, so a new one falls back
     to the mildest true statement instead of leaking. */
  const notes = explainGrouping([
    { from: "X", into: "Y", because: "cosine distance below 0.31" },
  ]);
  assert.equal(notes.length, 1);
  assert.ok(!/cosine|0\.31/.test(notes[0].sentence));
  assert.match(notes[0].sentence, /X was grouped under Y because it describes the same thing\./);
});

test("nothing to explain produces nothing", () => {
  assert.deepEqual(explainGrouping([]), []);
});

test("the page shows it collapsed, and points at the way to disagree", () => {
  const client = readFileSync(new URL(
    "../app/shop-map/shop-map-client.tsx", import.meta.url), "utf8");
  assert.match(client, /<details className="shop-map-grouping">/);
  assert.match(client, /How these niches were organized/);
  assert.ok(!/<details className="shop-map-grouping" open/.test(client),
    "it must be closed by default");
  assert.match(client, /move a listing below and its orders and\s*\n?\s*revenue move with it/);
  /* And the page still handles none of the internal vocabulary. */
  for (const leak of ["classifier", "collapse", "confidence", "canonical", "buyer"])
    assert.ok(!new RegExp(leak, "i").test(client), `the page handles ${leak}`);
});
