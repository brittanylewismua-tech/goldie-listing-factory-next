/**
 * THE REGISTER'S READING, TESTED WITHOUT USPTO.
 *
 * Every rule here decides whether a seller is warned or not, so each one is
 * pinned to a record shaped exactly like the ones in the bulk files — the
 * sample below is trimmed from a real record, not invented.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { normalize, readRecord, worthKeeping, PRINTED_CLASSES } from "../app/trademark-record.ts";
import { blocks, field, allFields, singleEntryDeflateStream } from "../app/uspto-bulk.ts";

const record = ({ status, mark, code, cancellation, drawing = "4", registration = "1234567" }) => `<case-file>
 <serial-number>99000001</serial-number>
 <registration-number>${registration}</registration-number>
 <case-file-header>
 <status-code>${status}</status-code>
 ${cancellation ? `<cancellation-date>${cancellation}</cancellation-date>` : ""}
 <mark-identification>${mark}</mark-identification>
 <mark-drawing-code>${drawing}</mark-drawing-code>
 </case-file-header>
 <classifications>
 <classification>
 <international-code>${code}</international-code>
 <primary-code>${code}</primary-code>
 </classification>
 </classifications>
 <case-file-owners>
 <case-file-owner>
 <party-name>Someone Else LLC</party-name>
 </case-file-owner>
 </case-file-owners>
 </case-file>`;

test("clothing is in scope and software is not", () => {
  assert.ok(PRINTED_CLASSES.has("025"));
  assert.ok(!PRINTED_CLASSES.has("042"));
});

test("normalize folds case, punctuation and spacing into one form", () => {
  assert.equal(normalize("Cozy  Season."), "COZY SEASON");
  assert.equal(normalize("cozy season"), "COZY SEASON");
  assert.equal(normalize("MAMA’S"), "MAMAS");
  assert.equal(normalize("Mama's"), "MAMAS");
});

test("a live clothing mark is kept, a dead one is not", () => {
  assert.equal(worthKeeping(readRecord(record({ status: 700, mark: "COZY SEASON", code: "025" }))), true);
  assert.equal(worthKeeping(readRecord(record({ status: 800, mark: "COZY SEASON", code: "025" }))), false);
});

test("a mark registered only for software is no hazard to a shirt", () => {
  assert.equal(worthKeeping(readRecord(record({ status: 700, mark: "ATLAS", code: "042" }))), false);
});

test("a cancelled mark is dead however healthy its status code looks", () => {
  const parsed = readRecord(record({ status: 700, mark: "GONE", code: "025", cancellation: "20240101" }));
  assert.equal(parsed.live, false);
  assert.equal(worthKeeping(parsed), false);
});

test("a design-only mark has no words to collide with", () => {
  assert.equal(worthKeeping(readRecord(record({ status: 700, mark: "SWOOSH", code: "025", drawing: "2" }))), false);
});

test("the owner, classes and registration number come off the record", () => {
  const parsed = readRecord(record({ status: 700, mark: "COZY SEASON", code: "025" }));
  assert.equal(parsed.owner, "Someone Else LLC");
  assert.equal(parsed.registration, "1234567");
  assert.deepEqual(parsed.classes, ["025"]);
});

test("a pending application reports no registration number and is still live", () => {
  const parsed = readRecord(record({ status: 630, mark: "PENDING THING", code: "025", registration: "0000000" }));
  assert.equal(parsed.registration, "");
  assert.equal(parsed.live, true);
});

test("records are cut out of a stream one at a time", async () => {
  const xml = `<?xml version="1.0"?><trademark-applications-daily>${record({ status: 700, mark: "ONE", code: "025" })}${record({ status: 700, mark: "TWO", code: "025" })}</trademark-applications-daily>`;
  const stream = new ReadableStream({
    start(controller) {
      /* Split mid-record on purpose: the cutter has to carry the remainder. */
      const bytes = new TextEncoder().encode(xml);
      controller.enqueue(bytes.slice(0, 300));
      controller.enqueue(bytes.slice(300));
      controller.close();
    },
  });
  const marks = [];
  for await (const block of blocks(stream, "case-file")) marks.push(field(block, "mark-identification"));
  assert.deepEqual(marks, ["ONE", "TWO"]);
});

test("a zip of one deflated entry is unwrapped and read", async () => {
  const { zipSync } = await import("fflate");
  const xml = `<root>${record({ status: 700, mark: "ZIPPED", code: "025" })}</root>`;
  const zipped = zipSync({ "apc.xml": new TextEncoder().encode(xml) }, { level: 6 });
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(zipped);
      controller.close();
    },
  });
  const marks = [];
  for await (const block of blocks(await singleEntryDeflateStream(body), "case-file"))
    marks.push(field(block, "mark-identification"));
  assert.deepEqual(marks, ["ZIPPED"]);
});

test("every class on a record is read, not just the first", () => {
  const many = record({ status: 700, mark: "MANY", code: "025" }).replace(
    "<primary-code>025</primary-code>",
    "<primary-code>025</primary-code>\n <international-code>016</international-code>",
  );
  assert.deepEqual(allFields(many, "international-code"), ["025", "016"]);
  assert.deepEqual(readRecord(many).classes, ["025", "016"]);
});

test("only data files are queued, and a file that cannot be read is parked", async () => {
  /* USPTO ships DTD documentation inside the data product. The ingest queued a
     .doc, failed with "Not a zip", requeued it, and picked it again — the
     register stopped loading for nine hours behind one Word document. */
  const { filesFromProduct } = await import("../app/uspto-bulk.ts");
  const files = filesFromProduct({
    bulkDataProductBag: [{ productFileBag: { fileDataBag: [
      { fileName: "apc260912.zip", fileDownloadURI: "https://example.test/a.zip" },
      { fileName: "Trademark-Applications-Documentation-v2.3.doc", fileDownloadURI: "https://example.test/b.doc" },
    ] } }],
  });
  assert.deepEqual(files.map(file => file.name), ["apc260912.zip"]);

  const { readFileSync } = await import("node:fs");
  const tick = readFileSync(new URL("../app/api/trademark/ingest-tick/route.ts", import.meta.url), "utf8");
  assert.match(tick, /A RETRY IS FOR A BAD MINUTE, NOT A BAD FILE/);
  /* D1644 · and a failure nobody put on the list is parked too, after three
     identical attempts. The list caught "Not a zip"; it did not catch
     "Trailing bytes after end of compressed data", and 88 files were retried
     forever behind it. */
  assert.match(tick, /permanent \|\| exhausted \? "skipped" : "waiting"/);
});
