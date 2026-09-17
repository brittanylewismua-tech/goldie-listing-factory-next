/*
  A TICKET INTO THE HARNESS, AND NOTHING ELSE.

  Some of this product's mobile rules need BOTH a narrow viewport and a
  coarse pointer. They hide the topbar on the responsive surfaces and set
  html,body{overflow:hidden} — so no amount of narrow-width testing can tell
  whether a phone can actually scroll those pages. An iframe gives a real
  narrow viewport but cannot make a browser report a touch device, and the
  only tool here with real device emulation has no session.

  This is the narrowest thing that closes that gap, so the checks below are
  about how narrow it stays.
*/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { looksLikeTicket, PREVIEW_TICKET_SECONDS } from "../app/preview-ticket.ts";

test("only a 64-character hex token is even looked up", () => {
  assert.equal(looksLikeTicket("a".repeat(64)), true);
  for (const bad of ["", null, undefined, "short", "A".repeat(64),
    "g".repeat(64), "a".repeat(63), "a".repeat(65), "../../etc", "1' OR '1'='1"])
    assert.equal(looksLikeTicket(bad), false, `${bad} was treated as a ticket`);
});

test("a ticket lasts minutes, not hours", () => {
  assert.equal(PREVIEW_TICKET_SECONDS, 300);
});

test("only the owner can mint one", () => {
  const route = readFileSync(new URL(
    "../app/api/dev/preview-ticket/route.ts", import.meta.url), "utf8");
  assert.match(route, /if \(!user \|\| !isOwner\(user\)\)/);
  assert.match(route, /\{ status: 404 \}/);
  /* The mint is after the check, not beside it. */
  assert.ok(route.lastIndexOf("isOwner(user)") < route.indexOf("mintPreviewTicket("),
    "the owner check must precede the mint");
});

test("the ticket is random, and long", () => {
  const module = readFileSync(new URL(
    "../app/preview-ticket.ts", import.meta.url), "utf8");
  assert.match(module, /new Uint8Array\(32\)/);
  assert.match(module, /crypto\.getRandomValues/);
  assert.ok(!/Math\.random/.test(module), "a ticket must not come from Math.random");
});

test("an expired ticket is refused, and expiry is checked in the query's own terms", () => {
  const module = readFileSync(new URL(
    "../app/preview-ticket.ts", import.meta.url), "utf8");
  assert.match(module, /Number\(row\.expiresAt\) > now/);
});

test("no route but the harness consults a ticket", () => {
  /*
    The whole safety argument is that this admits its holder to one page.
    If a second route ever reads it, that argument is gone.
  */
  const found = [];
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(new URL(`${entry.name}/`, dir));
      else if (/\.tsx?$/.test(entry.name)) {
        const text = readFileSync(new URL(entry.name, dir), "utf8");
        if (/previewTicketValid/.test(text))
          found.push(new URL(entry.name, dir).pathname.replace(/.*\/app\//, "app/"));
      }
    }
  };
  walk(new URL("../app/", import.meta.url));
  assert.deepEqual(found.sort(),
    ["app/dev/state-preview/page.tsx", "app/preview-ticket.ts"].sort(),
    `a ticket is consulted somewhere it should not be: ${found.join(", ")}`);
});

test("the harness still answers everything from fixtures behind a closed network", () => {
  /* The reason a ticket is safe at all. */
  const preview = readFileSync(new URL(
    "../app/dev/state-preview/preview-client.tsx", import.meta.url), "utf8");
  assert.match(preview, /window\.fetch = \(async \(input/);
  assert.match(preview, /No fixture for this request/);
  assert.match(preview, /Blocked by state preview/);
});
