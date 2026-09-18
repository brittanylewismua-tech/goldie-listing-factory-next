/*
  NOTHING A MEMBER READS MAY BE WRITTEN IN OUR VOCABULARY.

  Swept live across all thirteen member routes and found clean; this holds the
  strings a rendered-page crawl cannot reach, which is every error a member has
  not happened to trigger yet.

  Owner-only routes are exempt. They are diagnostics for one person who wants
  the column name, and pretending otherwise would make them useless.
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const matrix = read("../app/access-matrix.ts");

/* The owner-only list in the access matrix is the authority on who sees what.
   It is a bare array of route strings, so the block itself is the membership
   test — an earlier version of this filter compared indexes and let an owner
   route through as a member's. */
const ownerBlock = matrix.slice(matrix.indexOf("OWNER_PREFIXES"));
const isOwnerOnly = (route) => ownerBlock.includes(`"${route}"`);

/* Comments are where the reasons live, and the reasons quote the very
   phrases these tests forbid. Strip them, or the file's own explanation of a
   rule trips the rule. */
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const routes = [];
const walk = (dir) => {
  for (const entry of readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const next = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(next);
    else if (entry.name === "route.ts" || entry.name.endsWith(".tsx")) routes.push(next);
  }
};
walk("../app");

const SNAKE = /\b[a-z]+_[a-z_]{2,}\b/;
const SCREAM = /\b[A-Z]{2,}_[A-Z_]{2,}\b/;
const FIELD = /\b(?:userId|shopId|listingId|worldId|primaryNiche|createdAt|builtAt|payloadJson|resultJson)\b/;
const CODE = /\bHTTP \d{3}\b|\bstatus \d{3}\b/;

test("no member-facing error names a column, a variable or an HTTP code", () => {
  const offences = [];
  for (const file of routes) {
    /* An owner route may say FAL_KEY; that is the point of an owner route. */
    const apiPath = "/" + file.replace(/^\.\.\/app\//, "").replace(/\/route\.ts$/, "");
    if (isOwnerOnly(apiPath) || /mastermind|operations|\/dev\//.test(file)) continue;
    const source = stripComments(read(file));
    for (const match of source.matchAll(/error:\s*["'`]([^"'`]{8,240})["'`]/g)) {
      const message = match[1];
      if (message.includes("${")) continue;
      for (const [name, re] of [["snake_case", SNAKE], ["SCREAMING", SCREAM],
        ["field name", FIELD], ["HTTP code", CODE]])
        if (re.test(message))
          offences.push(`${file} — ${name} — ${message.slice(0, 90)}`);
    }
  }
  assert.deepEqual(offences, [],
    `internal vocabulary in a member's error:\n${offences.join("\n")}`);
});

test("no member-facing string claims a completeness the product does not have", () => {
  const offences = [];
  const CLAIMS = /\b(?:complete search|fully complete|100% complete|all files (?:are )?(?:done|loaded)|everything is up to date)\b/i;
  for (const file of routes) {
    if (/mastermind|operations|\/dev\//.test(file)) continue;
    const source = stripComments(read(file));
    for (const match of source.matchAll(/["'`]([^"'`]{12,240})["'`]/g))
      if (CLAIMS.test(match[1]) && !/never|not a|is not|rather than|cannot/i.test(match[1]))
        offences.push(`${file} — ${match[1].slice(0, 90)}`);
  }
  assert.deepEqual(offences, [], `a completeness claim:\n${offences.join("\n")}`);
});
