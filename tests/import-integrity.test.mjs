import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";

/**
 * A MISSING IMPORT SHIPPED AND TOOK THE BOARD DOWN.
 *
 * `attribute` was used in sold-overnight.ts and never imported. The edit that
 * should have added the import anchored on a line another branch had already
 * changed, matched nothing, and silently did nothing.
 *
 * Both gates were green. `npm run build` does not typecheck — rolldown
 * compiles an undefined identifier happily — and the tests read source text
 * rather than executing the module. So the only thing that noticed was
 * production, with a 500 on every request.
 *
 * This closes that gap for the modules that cross files: if a symbol another
 * app module exports is used here, it has to be imported here.
 */

const APP = new URL("../app/", import.meta.url);

function sources(dir = APP, found = []) {
  for (const name of readdirSync(dir)) {
    const at = new URL(name, dir);
    if (statSync(at).isDirectory()) sources(new URL(`${name}/`, dir), found);
    else if (/\.tsx?$/.test(name) && !name.endsWith(".d.ts"))
      found.push({ path: at, name: `${dir.pathname.split("/app/")[1] ?? ""}${name}` });
  }
  return found;
}

const files = sources();

/* What each module exports, by name. */
const exported = new Map();
for (const file of files) {
  const text = readFileSync(file.path, "utf8");
  const module = file.name.replace(/\.tsx?$/, "");
  for (const [, name] of text.matchAll(
    /^export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gm))
    exported.set(name, module);
}

const strip = s =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ")
   .replace(/^\s*\/\/.*$/gm, " ")
   .replace(/(['"`])(?:\\.|(?!\1)[\s\S])*?\1/g, '""');

test("a symbol from another module is imported where it is used", () => {
  const missing = [];

  for (const file of files) {
    const raw = readFileSync(file.path, "utf8");
    const module = file.name.replace(/\.tsx?$/, "");
    const code = strip(raw);

    /* Everything this file already imports, however it was written. */
    const imported = new Set();
    for (const [, names] of raw.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from/g))
      for (const part of names.split(","))
        imported.add(part.replace(/^\s*type\s+/, "").split(/\s+as\s+/).pop().trim());
    for (const [, name] of raw.matchAll(/import\s+([A-Za-z_$][\w$]*)\s*(?:,|from)/g))
      imported.add(name);

    /* Anything declared in this file is obviously fine — including names bound
       by destructuring, by a parameter list, or by a catch clause. Missing any
       of those turns an ordinary local into a false alarm, and a check that
       cries wolf gets switched off. */
    const local = new Set();
    for (const [, name] of raw.matchAll(
      /(?:^|\s)(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g))
      local.add(name);
    for (const [, inside] of raw.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g))
      for (const part of inside.split(","))
        local.add(part.split(":").pop().split("=")[0].trim());
    for (const [, params] of raw.matchAll(/\(([^()]*)\)\s*(?::[^=]*)?=>/g))
      for (const part of params.split(","))
        local.add(part.replace(/[{}\[\]]/g, "").split(":")[0].split("=")[0].trim());

    for (const [name, from] of exported) {
      if (from === module || local.has(name) || imported.has(name)) continue;
      /* Called as a bare function — never as somebody's method, and never as
         a word in prose. */
      if (!new RegExp(`(^|[^.\\w$])${name}\\s*\\(`, "m").test(code)) continue;
      missing.push(`${file.name} uses ${name}() from ${from} without importing it`);
    }
  }

  assert.deepEqual(missing, [],
    `an undefined identifier compiles and ships — the build does not typecheck:\n${missing.join("\n")}`);
});
