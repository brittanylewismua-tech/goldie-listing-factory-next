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
