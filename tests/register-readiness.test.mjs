/*
  THE ONE SCREEN WHERE THE LIMITATION MATTERS MOST WAS THE ONE SCREEN THAT
  HID IT.

  Four call sites decided whether the federal register is complete enough to
  call a "no match" result a clean search. Three wrote the same two-line rule
  by hand. The fourth — the Listing Factory's publish-time check, which runs
  when a member is about to put a design on Etsy — passed the size OBJECT
  where the boolean goes:

    withRegister(check(phrase), hits, size)

  An object is always truthy, so that path reported a complete federal
  register search, in those words, while 79 of 113 bulk files were waiting.

  The same call also passed raw lookup rows straight in, so `exact` was
  undefined on every match. `serious` requires exact OR a multi-word mark,
  which downgraded an EXACT SINGLE-WORD registered trademark from high risk
  to a minor mention — again, on the publish path.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { registerIsReady, registerIsComplete, registerParkedFiles, toMatches,
  withRegister, check } from "../app/trademark-check.ts";

/* D1705 · withRegister takes the size object, not a boolean — see the comment
   above registerIsReady for what a derived boolean cost last time. LOADED
   finished with nothing left out; LOADING still has files waiting; PARKED
   finished but could not read three of them. */
const LOADED = { marks: 201000, files: [{ state: "done", count: 118 }] };
const LOADING = { marks: 201000, files: [{ state: "done", count: 49 },
  { state: "waiting", count: 69 }] };
const PARKED = { marks: 201000, files: [{ state: "done", count: 115 },
  { state: "skipped", count: 3 }] };

const normalize = value => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

test("the register is only ready when nothing is still waiting", () => {
  assert.equal(registerIsReady({ marks: 190_000, files: [{ state: "done", count: 34 }] }), true);
  assert.equal(registerIsReady({ marks: 190_000,
    files: [{ state: "done", count: 34 }, { state: "waiting", count: 79 }] }), false);
  assert.equal(registerIsReady({ marks: 190_000,
    files: [{ state: "done", count: 34 }, { state: "partial", count: 1 }] }), false);
  /* A skipped file is a file deliberately parked, not one still coming. */
  assert.equal(registerIsReady({ marks: 190_000,
    files: [{ state: "done", count: 34 }, { state: "skipped", count: 3 }] }), true);
  /* An empty register is never ready, however few files are queued. */
  assert.equal(registerIsReady({ marks: 0, files: [] }), false);
  assert.equal(registerIsReady(null), false);
  /* And the shape that caused this: an object is not a yes. */
  assert.equal(registerIsReady({ marks: 1, files: [{ state: "waiting", count: 1 }] }), false);
});

test("an incomplete register never produces the complete-search wording", () => {
  const clean = check("bride tribe squad");
  const loading = withRegister(clean, [], LOADING);
  const done = withRegister(clean, [], LOADED);
  assert.match(loading.summary, /trademark records currently loaded/);
  assert.ok(!/current federal/.test(loading.summary),
    "an incomplete register must not claim the current federal register");
  /* The complete state no longer claims the federal register either: the
     corpus is what was ingested, not the register itself. It must still be
     distinguishable from the loading state. */
  assert.ok(!/current federal/.test(done.summary),
    "a complete register still claims to be the federal register");
  assert.match(done.summary, /available here/);
  assert.notEqual(done.summary, loading.summary,
    "the two register states became indistinguishable");
  assert.equal(loading.registerReady, false);
});

test("an exact single-word registered mark is serious, not a mention", () => {
  const hits = [{ mark: "Stanley", owner: "PMI", registration: "1", registered: true }];
  const matches = toMatches(hits, "stanley", normalize);
  assert.equal(matches[0].exact, true, "exact must be computed, not left undefined");
  const verdict = withRegister(check("stanley"), matches, LOADED);
  assert.equal(verdict.risk, "high");
  /* Unmapped rows are what produced the downgrade. */
  const unmapped = withRegister(check("stanley"), hits, LOADED);
  assert.notEqual(unmapped.risk, "high",
    "this is the behaviour the publish path had, kept here as the reason for toMatches");
});

test("no route computes register readiness by hand any more", () => {
  const routes = [];
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(new URL(`${entry.name}/`, dir));
      else if (entry.name === "route.ts") routes.push(new URL(entry.name, dir));
    }
  };
  walk(new URL("../app/api/", import.meta.url));
  for (const file of routes) {
    const source = readFileSync(file, "utf8");
    if (!/withRegister/.test(source)) continue;
    assert.ok(!/state === "waiting" \|\| file\.state === "partial"/.test(source),
      `${file.pathname} still writes the readiness rule by hand`);
    /*
      D1705 · Stronger than "use the shared rule": no route derives the
      booleans at all any more. withRegister takes the size object and works
      both facts out itself, so a call site cannot pass the wrong one — which
      is exactly what the publish path did.
    */
    for (const call of source.matchAll(/withRegister\([\s\S]{0,200}?\)/g))
      assert.ok(!/,\s*(?:true|false)\s*\)$/.test(call[0]),
        `${file.pathname} passes a boolean to withRegister: ${call[0].slice(0, 80)}`);
  }
});

test("D1705: final is not the same as complete", () => {
  /*
    registerIsReady asks whether the queue stopped moving; it ignores skipped,
    which is right for its purpose. It was also driving the sentence a member
    reads on a clean result — so the moment the queue emptied, that sentence
    would have claimed a search of the whole federal register while the marks
    from every parked file were missing from it.
  */
  assert.equal(registerIsReady(PARKED), true, "the queue has stopped");
  assert.equal(registerIsComplete(PARKED), false, "but three files never loaded");
  assert.equal(registerIsComplete(LOADED), true);
  assert.equal(registerIsComplete(LOADING), false);
  assert.equal(registerIsComplete(null), false);
  assert.equal(registerParkedFiles(PARKED), 3);
  assert.equal(registerParkedFiles(LOADED), 0);
});

test("D1705: only a register with nothing left out names the whole register", () => {
  /*
    D1734 · NO STATE NAMES THE WHOLE REGISTER ANY MORE.

    This asserted that a complete register was allowed to say "the current
    federal trademark register". It was never entitled to: ingestion kept nine
    classes out of forty-five, so a cosmetics mark like HAUS LABS was absent
    while the sentence told the member the federal register had been searched.
    What is searched is what we hold.
  */
  const complete = withRegister(check("mountains at dawn"), [], LOADED);
  assert.match(complete.summary, /available here, or the curated risk list/);
  assert.ok(!/current federal/.test(complete.summary));

  const parked = withRegister(check("mountains at dawn"), [], PARKED);
  assert.equal(parked.registerReady, true);
  assert.match(parked.summary, /trademark records that could be read/);
  assert.match(parked.summary, /not the whole register/);
  assert.ok(!/current federal trademark register/.test(parked.summary),
    "a register missing files must not name itself as the register");
  assert.notEqual(parked.summary, complete.summary,
    "parked and complete must stay distinguishable");

  const loading = withRegister(check("mountains at dawn"), [], LOADING);
  assert.match(loading.summary, /records currently loaded/);

  /* All three still refuse to read as clearance. */
  for (const verdict of [complete, parked, loading])
    assert.match(verdict.summary, /screening information, not legal clearance/);
});
