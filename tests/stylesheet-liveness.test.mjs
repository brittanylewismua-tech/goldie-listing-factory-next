import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);

/* WHY THIS FILE EXISTS
 *
 * Twice a fix shipped, changed nothing, and cost a deploy plus a round trip to
 * discover — both times because a rule in clarity-pass.css described markup that
 * had moved or been deleted:
 *
 *   D211  `.batch-product-rows .row-panel` — the panel was a SIBLING of that
 *         element, so every rule for it was inert. Shipped, looked wrong, redeployed.
 *   D234  `.batch-product-card > .product-color-selector` — D218 had renested the
 *         panel inside the rows list, so the padding fix matched nothing. Shipped,
 *         looked identical, redeployed.
 *
 * Both were invisible to the suite because the tests asserted the rule's TEXT
 * existed in the file. A stylesheet rule that selects nothing is not a style; it
 * is a comment with syntax. This checks liveness in the only way possible
 * without a browser: every class the stylesheet targets must exist somewhere in
 * the markup that renders. It cannot prove a selector matches, but it does catch
 * the whole family of rules left behind when markup is deleted — which is what
 * made the file misleading enough to fool me twice.
 */

async function collect(dir, extensions, out = []) {
  for (const entry of await readdir(new URL(dir, root), { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const next = `${dir}${entry.name}${entry.isDirectory() ? "/" : ""}`;
    if (entry.isDirectory()) await collect(next, extensions, out);
    else if (extensions.some((ext) => entry.name.endsWith(ext))) out.push(next);
  }
  return out;
}

test("clarity-pass.css never styles markup that no longer exists", async () => {
  const css = (await readFile(new URL("app/clarity-pass.css", root), "utf8"))
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const targeted = new Set([...css.matchAll(/\.([a-zA-Z][\w-]+)/g)].map((m) => m[1]));

  const sourceFiles = await collect("app/", [".tsx", ".ts"]);
  const styleFiles = (await collect("app/", [".css"])).filter((f) => !f.includes("clarity-pass"));
  const markup = (await Promise.all(sourceFiles.map((f) => readFile(new URL(f, root), "utf8")))).join("");
  const otherStyles = (await Promise.all(styleFiles.map((f) => readFile(new URL(f, root), "utf8")))).join("");

  const dead = [...targeted].filter((name) => !markup.includes(name) && !otherStyles.includes(name)).sort();
  assert.deepEqual(dead, [],
    `these classes are styled but never rendered — delete the rules or fix the selector: ${dead.join(", ")}`);
});

/* D236 · An orphaned selector list is invisible and contagious. D234 removed a
   rule's declaration block and left `a, b, c,` with a trailing comma; the next
   rule's selector joined that list, so three panels silently took
   `overflow:visible` and the rule below was applied to elements it was never
   written for. A blank line inside a selector list is never deliberate. */
test("no stylesheet has an orphaned selector list", async () => {
  const orphans = [];
  for (const file of await readdir(new URL("app/", root))) {
    if (!file.endsWith(".css")) continue;
    const raw = await readFile(new URL(`app/${file}`, root), "utf8");
    const bare = raw.replace(/\/\*[\s\S]*?\*\//g, "\n");
    for (const chunk of bare.split("}")) {
      const head = chunk.slice(0, chunk.indexOf("{"));
      if (chunk.indexOf("{") === -1 || !head.includes(",")) continue;
      if (/,\s*\n\s*\n/.test(head)) orphans.push(`${file}: ${head.trim().split("\n")[0]} …`);
    }
  }
  assert.deepEqual(orphans, [], `a selector list is missing its declaration block, so it is
absorbing the next rule:\n${orphans.join("\n")}`);
});

/* D244 · A card's icon must follow the class that says what the card IS, never
   its position among siblings. `.step-card:first-child>.step-number:after`
   outranked every semantic rule because :first-child adds specificity, so the
   four-page restructure silently handed each card the previous occupant's icon.
   Positional selectors are how markup moves break styling without any rule
   going dead — the liveness test above cannot see this, because every class
   involved is real. */
test("no icon is chosen by DOM position", async () => {
  const offenders = [];
  for (const file of await readdir(new URL("app/", root))) {
    if (!file.endsWith(".css")) continue;
    const css = (await readFile(new URL(`app/${file}`, root), "utf8"))
      .replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [rule] of css.matchAll(/[^{}]+\{[^}]*\}/g)) {
      const sel = rule.slice(0, rule.indexOf("{"));
      if (!/step-number:after|:after\{[^}]*mask-image/.test(rule)) continue;
      if (/:(?:first-child|last-child|nth-child|nth-of-type|first-of-type)/.test(sel))
        offenders.push(`${file}: ${sel.trim()}`);
    }
  }
  assert.deepEqual(offenders, [], `these icons are picked by position, so moving a
card changes its meaning:\n${offenders.join("\n")}`);
});

/* D246 · A component rendered in two shells cannot rely on a stylesheet scoped
   to one of them. The nav icons had no intrinsic size, and the only rules that
   sized them were `.app-shell .top-nav svg` — so on every management page they
   fell back to ~150px of solid black over the labels. */
test("nav icons carry their own size and stroke", async () => {
  const src = await readFile(new URL("app/nav-icons.tsx", root), "utf8");
  for (const key of ["width", "height", "stroke", "fill"])
    assert.match(src, new RegExp(`${key}:`), `nav icons must set ${key} on the element`);
  assert.doesNotMatch(src, /<svg viewBox="0 0 24 24" aria-hidden="true">/,
    "a bare <svg> here renders 150px black wherever the factory stylesheet is absent");
});

/* D254 · The factory pages and the management pages were running two different
   type scales — 64px page titles against 34px, and seven sizes for one card
   title. Anything that reintroduces a hard-coded heading size outside the
   D233 scale should be visible in review, so keep the scale itself in one file
   and assert the sizes it declares are the ones the app is allowed to use. */
test("headings use the D233 scale only", async () => {
  const css = (await readFile(new URL("app/clarity-pass.css", root), "utf8"))
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const allowed = new Set(["34px", "22px", "15px", "12px", "10px", "18px"]);
  const bad = [];
  for (const [rule] of css.matchAll(/[^{}]+\{[^}]*\}/g)) {
    const sel = rule.slice(0, rule.indexOf("{"));
    if (!/\bh[1-5]\b/.test(sel)) continue;
    for (const [, size] of rule.matchAll(/font(?:-size)?:[^;}]*?(\d+px)/g))
      if (!allowed.has(size)) bad.push(`${sel.trim().slice(0, 60)} -> ${size}`);
  }
  assert.deepEqual(bad, [], `heading sizes outside the D233 scale:\n${bad.join("\n")}`);
});

/* D275 · `.app-shell` wraps the Listing Factory only. Verified on the deployed
   site: document.querySelector('.app-shell') is null on /keywords, /mockups,
   /batches and /usage. Two rules written tonight for management-page elements
   were scoped to it and therefore matched nothing — the same shape as D246,
   twice more. A rule for a management-only class must not require .app-shell. */
test("management-page rules are not scoped to the factory shell", async () => {
  const css = (await readFile(new URL("app/clarity-pass.css", root), "utf8"))
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const managementOnly = ["management-nav", "bank-delete", "management-page",
    "usage-card", "usage-page", "keyword-workspace", "mockupHero", "setTitleRow"];
  const bad = [];
  for (const [rule] of css.matchAll(/[^{}]+\{[^}]*\}/g)) {
    const group = rule.slice(0, rule.indexOf("{")).split(",").map((x) => x.trim());
    for (const sel of group) {
      if (!sel.includes(".app-shell")) continue;
      if (!managementOnly.some((cls) => sel.includes(`.${cls}`))) continue;
      /* A group may carry both the scoped and unscoped form; that is fine. */
      const unscoped = sel.replace(/\.app-shell\s*/, "").trim();
      if (group.includes(unscoped)) continue;
      bad.push(sel.slice(0, 70));
    }
  }
  assert.deepEqual([...new Set(bad)], [],
    `these target management-page elements but require .app-shell, which those pages do not render:\n${bad.join("\n")}`);
});
