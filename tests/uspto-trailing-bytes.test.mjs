/*
  THE ZIP READER'S OWN COMMENT WAS WRONG, AND IT COST THE ENTIRE BACKFILE.

  "Everything after the entry sits past the deflate stream's own end, and the
  decompressor stops there on its own, so it costs nothing to ignore." It does
  not stop. DecompressionStream reads the trailing data descriptor and central
  directory and throws "Trailing bytes after end of compressed data".

  That only happens when the local header declares a compressed size of zero —
  a zip written as a stream, with its size in a descriptor after the data — so
  the bound that protects every other file does not exist. The USPTO daily
  files carry a real size and were fine. The historical backfile does not.

  Measured on the deployed build: the ingest tick returned 500 with
  "Trailing bytes after end of compressed data" on apc18840407-20251231-87.zip,
  with 27 files done, 3 skipped and 88 waiting, and nothing completed in 12
  hours — while the health probe reported progressing: true, because the daily
  files kept landing behind the stuck queue.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { endsCleanlyOnTrailingBytes } from "../app/uspto-bulk.ts";

const bytes = text => new TextEncoder().encode(text);
const collect = async stream => {
  const reader = stream.getReader();
  let out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    out += new TextDecoder().decode(value);
  }
  return out;
};

/*
  Chunks delivered first, then the failure — which is how a real
  DecompressionStream behaves: it emits every byte of the entry and only
  complains when it reaches what follows. controller.error() in start() would
  discard the queued chunks and model the opposite.
*/
const streamOf = (chunks, failWith) => {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) { controller.enqueue(bytes(chunks[index++])); return; }
      if (failWith) controller.error(new Error(failWith));
      else controller.close();
    },
  });
};

test("a complete entry followed by trailing bytes reads as complete", async () => {
  const out = await collect(endsCleanlyOnTrailingBytes(
    streamOf(["<record>one</record>", "<record>two</record>"],
      "Trailing bytes after end of compressed data")));
  assert.equal(out, "<record>one</record><record>two</record>",
    "every byte the decompressor produced must survive the complaint about what follows");
});

test("the same complaint with no output is still a failure", async () => {
  /* Nothing was produced, so this is a broken entry rather than a complete one
     with a directory behind it. Swallowing it would turn a corrupt file into a
     silently empty one, which is worse than the bug being fixed. */
  await assert.rejects(
    () => collect(endsCleanlyOnTrailingBytes(
      streamOf([], "Trailing bytes after end of compressed data"))),
    /Trailing bytes/);
});

test("any other failure still throws, however much was produced", async () => {
  await assert.rejects(
    () => collect(endsCleanlyOnTrailingBytes(
      streamOf(["<record>one</record>"], "unexpected end of file"))),
    /unexpected end of file/);
});

test("a clean stream is passed through untouched", async () => {
  const out = await collect(endsCleanlyOnTrailingBytes(streamOf(["abc", "def"])));
  assert.equal(out, "abcdef");
});

test("a failure nobody listed stops being retried forever", () => {
  /*
    The permanent-failure test is a list of error strings somebody thought of,
    and this was the second error to walk past it — so all 88 historical files
    were classified transient, went back in the queue in the same order, and
    were retried forever. A file that fails the same way repeatedly is parked
    whatever its message says.
  */
  const route = readFileSync(new URL(
    "../app/api/trademark/ingest-tick/route.ts", import.meta.url), "utf8");
  assert.match(route, /const REPEATED_FAILURE_LIMIT = 3/);
  assert.match(route, /const sameAgain = \(next\.note \?\? ""\)/);
  assert.match(route, /const exhausted = !limited && repeats >= REPEATED_FAILURE_LIMIT/);
  /* A rate limit is not a repeat: the other side asking for time must keep
     its escalating backoff rather than being parked after three refusals. */
  assert.match(route, /!limited && repeats/);
  assert.match(route, /permanent \|\| exhausted \? "skipped" : "waiting"/);
  /* And the note stays, so a wrongly parked file is findable. */
  assert.match(route, /SET state = \?, note = \?, retry_after = \?, strikes = \?, repeats = \?/);
});

test("the health probe measures the backfile on its own", () => {
  /*
    "When did a file last finish" cannot tell a daily file from a historical
    one, and a daily file arrives every day — so the probe reported
    progressing: true for days while 88 historical files failed identically
    every twenty minutes and not one ever completed. The probe answered the
    question it was asked; the question pooled two queues with completely
    different cadences.
  */
  const route = readFileSync(new URL(
    "../app/api/operations/health/route.ts", import.meta.url), "utf8");
  assert.match(route, /state = 'done' AND priority > 2/,
    "the backfile's own last completion must be measured");
  assert.match(route, /state IN \('waiting','partial'\) AND priority > 2/);
  assert.match(route, /backfileStalled/);
  /* A tick runs every twenty minutes; six hours of nothing with work waiting
     is a stall, not a slow patch. */
  assert.match(route, /backfileSince > 6 \* 3_600/);
  assert.match(route, /: backfileStalled \? "broken"/,
    "a dead backfile must read as broken, not ok");
});
