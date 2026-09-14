import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("D1379: discovery stores favourites, and binds as many values as it asks for", () => {
  /* Six values were bound to five placeholders and `favorites` was not in the
     column list at all. D1 rejects the whole statement, so every discovery
     call threw, so runSweep threw before reaching the reading pass — the
     scheduled sweep was dead at every firing and only the page-load nudge
     (discovery:false) kept the board moving. 29 cron 500s in the error log. */
  const source = read("app/sold-overnight.ts");
  const insert = source.slice(source.indexOf("INSERT OR IGNORE INTO sold_watch"));
  const statement = insert.slice(0, insert.indexOf("`)"));
  assert.match(statement, /\(listing_id,shop_id,title,url,taxonomy_id,favorites\)/);
  assert.equal((statement.match(/\?/g) || []).length, 6);
});

test("D1379: every prepared statement binds what it asks for", () => {
  /* The general form of the same fault. Walks each prepare().bind() pair with
     a real bracket matcher rather than a regex, because the binds run over
     many lines and a naive match truncates them and then cries wolf.

     Statements that build their placeholders at runtime — an interpolated
     WHERE, or a spread of one bind per search word — cannot be counted this
     way and are skipped rather than guessed at. */
  const source = read("app/sold-overnight.ts");

  const args = (text, open) => {
    let depth = 0, count = 0, started = false;
    for (let i = open; i < text.length; i++) {
      const ch = text[i];
      if ("([{`".includes(ch)) { depth++; if (depth === 1) { started = true; continue; } }
      else if (")]}".includes(ch)) { depth--; if (depth === 0) return { count: started && text.slice(open + 1, i).trim() ? count + 1 : 0, end: i }; }
      else if (ch === "," && depth === 1) count++;
    }
    return null;
  };

  const problems = [];
  for (const match of source.matchAll(/prepare\(/g)) {
    const tick = source.indexOf("`", match.index);
    if (tick < 0) continue;
    const close = source.indexOf("`", tick + 1);
    const sql = source.slice(tick + 1, close);
    const after = source.slice(close, close + 3000);
    const bindAt = after.indexOf(".bind(");
    if (bindAt < 0 || bindAt > 40) continue;
    if (sql.includes("${")) continue;
    const counted = args(after, close + bindAt + ".bind".length);
    if (!counted) continue;
    if (after.slice(bindAt, bindAt + (counted.end - (close + bindAt))).includes("...")) continue;
    const holes = (sql.match(/\?/g) || []).length;
    if (holes !== counted.count)
      problems.push(`${holes} placeholders, ${counted.count} bound: ${sql.slice(0, 70).replace(/\s+/g, " ")}`);
  }
  assert.deepEqual(problems, [], `binding mismatch:\n${problems.join("\n")}`);
});
