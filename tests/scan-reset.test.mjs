/*
  D1690 · "0 scans left today" with no time. The allowance is a rolling day,
  so the next scan is not at midnight — it is when the oldest of the consumed
  ten ages out. The value was already computed and simply never sent.
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "scanreset-"));
execFileSync("npx", ["tsc", "--target", "es2022", "--module", "es2022",
  "--outDir", dir, "--skipLibCheck", "app/scan-reset.ts"],
  { cwd: new URL("..", import.meta.url).pathname, stdio: "pipe" });
const { nextScanAt } = await import(join(dir, "scan-reset.js"));
const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const now = Date.parse("2026-09-18T00:00:00Z");
const at = (mins) => new Date(now + mins * 60_000).toISOString();

test("a member at the limit is told when one comes back", () => {
  assert.equal(nextScanAt(at(25), now), "in about 25 minutes");
  assert.equal(nextScanAt(at(1), now), "in about 1 minute");
  assert.equal(nextScanAt(at(150), now), "in about 3 hours");
  assert.equal(nextScanAt(at(60), now), "in about 1 hour");
});

test("a time already past is not rendered as a negative wait", () => {
  assert.equal(nextScanAt(at(-30), now), "any moment now");
  assert.equal(nextScanAt(at(0), now), "any moment now");
});

test("no value and an unusable value both say nothing rather than guessing", () => {
  for (const bad of [null, undefined, "", "not a date"])
    assert.equal(nextScanAt(bad, now), "");
});

test("the reset is never described as midnight", () => {
  for (const mins of [5, 90, 600, 1_400])
    assert.ok(!/midnight|tomorrow/i.test(nextScanAt(at(mins), now)),
      "the allowance is a rolling day, and midnight is the guess a member "
      + "makes when no time is given");
});

test("the value the server already had is now sent and shown", () => {
  const route = src("../app/api/design-scanner/scan/route.ts");
  const sent = [...route.matchAll(/nextScanAt: usage\.oldestLeavesWindowAt/g)];
  assert.equal(sent.length, 2, "both the scan result and the history load");
  const client = src("../app/design-scanner/design-scanner-client.tsx");
  assert.match(client, /from "@\/app\/scan-reset"/);
  assert.match(client, /\{left === 0 && nextScanAt\(nextAt\)/,
    "shown only at the limit; with scans left the count is the whole story");
});
