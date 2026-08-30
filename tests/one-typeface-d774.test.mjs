import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import postcss from "postcss";

/* D774 · One typeface, and no more "the last Manrope on the page".

   Four sweeps in a row found it, and each time it was a different class - the
   goal caption, then the library headings, then H2, H3 and the listing-rows
   controls. Naming them one at a time is how the list never ends. Everything
   inside the shell inherits the shell's family; the only exceptions are the
   wordmark and its star, which are the logo, and the pages this migration does
   not touch.

   So: no rule inside the Listing Factory may hand a different family to
   something with !important, because that is the only way to beat inheritance
   and it is what kept happening. */

const EXEMPT = /wordmark|approved-wm|approved-i\b|approved-footer-i|keyword-hero|mockupHero|management-page|managementOnly|usage-page|batch-history|support-|mobile-/;

const offenders = [];
for (const name of readdirSync(new URL("../app", import.meta.url)).filter(file => file.endsWith(".css"))) {
  postcss.parse(readFileSync(new URL(`../app/${name}`, import.meta.url), "utf8")).walkDecls(decl => {
    if (decl.prop !== "font-family" || !decl.important) return;
    const selector = decl.parent.selector || "";
    if (EXEMPT.test(selector)) return;
    if (/Inter/.test(decl.value)) return;                 /* saying Inter loudly is fine */
    offenders.push(`${name}: ${selector.replace(/\s+/g, " ").slice(0, 52)} — ${decl.value.slice(0, 30)}`);
  });
}

test("nothing in the factory shouts a different typeface", () => {
  assert.deepEqual(offenders, [],
    `these beat the shell's own family with !important:\n${offenders.join("\n")}`);
});
