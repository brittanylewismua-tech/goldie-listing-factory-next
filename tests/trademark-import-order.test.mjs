import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { zipSync, strToU8 } from "fflate";
import { trademarkImportRanges, trademarkFileDay } from "../app/trademark-import-coverage.ts";

async function implementation() {
  const source = readFileSync(new URL("../app/trademark-register.ts", import.meta.url), "utf8")
    .replace(/^import .*;\n/gm, "")
    .replace(/^export \{[^}]*\} from ["'][^"']+["'];?$/gm, "");
  const imports = [
    ['normalize, squeeze, readRecord, worthKeeping', 'trademark-record.ts'],
    ['blocks, singleEntryDeflateStream', 'uspto-bulk.ts'],
    ['TRADEMARK_ARCHIVE_DAY, trademarkFileDay', 'trademark-import-coverage.ts'],
  ].map(([names, file]) => `const {${names}} = await import(${JSON.stringify(new URL('../app/' + file, import.meta.url).href)});`).join('\n');
  return import('data:text/javascript;base64,' + Buffer.from(imports + ts.transpileModule(source,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText).toString('base64'));
}
function database() {
  const sqlite = new DatabaseSync(':memory:');
  const prepare = (sql, args = []) => ({
    bind: (...values) => prepare(sql, values),
    run: async () => ({ meta: sqlite.prepare(sql).run(...args) }),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
  });
  return { sqlite, prepare, batch: async statements => {
    sqlite.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run());
      sqlite.exec('COMMIT'); return results;
    } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  }};
}
function xml(mark, status = 700) {
  return `<case-file><serial-number>12345678</serial-number><registration-number>7654321</registration-number><case-file-header><mark-identification>${mark}</mark-identification><status-code>${status}</status-code><mark-drawing-code>4</mark-drawing-code></case-file-header><classifications><international-code>025</international-code></classifications><case-file-owners><party-name>Example</party-name></case-file-owners></case-file>`;
}

test('imports cover every day after the archive, including a gap before launch', () => {
  for (const today of ['2026-09-21', '2027-02-01']) {
    const [daily, archive] = trademarkImportRanges(today);
    assert.equal(Date.parse(daily.from) - Date.parse(archive.to), 86400000);
    assert.equal(daily.to, today);
    assert.ok(daily.from < '2026-08-24');
  }
  assert.equal(trademarkFileDay({name: 'apc260824.zip'}), '2026-08-24');
  assert.equal(trademarkFileDay({name: 'apc18840407-20251231-91.zip'}), '2025-12-31');
  assert.throws(() => trademarkFileDay({name: 'unknown.zip'}));
  assert.throws(() => trademarkFileDay({name: 'apc260231.zip'}));
});

test('newer names, cancellations and reinstatements survive out-of-order imports', async t => {
  const mod = await implementation();
  const db = database();
  t.after(() => db.sqlite.close());
  await mod.ensureRegisterTables(db);
  let payload;
  t.mock.method(globalThis, 'fetch', async () => new Response(zipSync({'register.xml': strToU8(payload)})));
  const ingest = async (name, mark, status = 700) => {
    payload = xml(mark, status);
    await mod.ingestFile(db, { name, url: 'https://example.invalid/register.zip', product: 'test' }, 'test');
  };
  await ingest('apc260920.zip', 'NEW WORDING');
  await ingest('apc18840407-20251231-91.zip', 'OLD WORDING');
  assert.equal((await mod.lookup(db, 'NEW WORDING')).length, 1);
  assert.equal((await mod.lookup(db, 'OLD WORDING')).length, 0);
  await ingest('apc260921.zip', 'NEW WORDING', 800);
  await ingest('apc260920.zip', 'NEW WORDING');
  await ingest('apc18840407-20251231-91.zip', 'OLD WORDING');
  assert.equal((await mod.lookup(db, 'NEW WORDING')).length, 0);
  assert.equal((await mod.registerSize(db)).marks, 0);
  await ingest('apc260922.zip', 'REINSTATED');
  await ingest('apc260921.zip', 'NEW WORDING', 800);
  await ingest('apc18840407-20251231-91.zip', 'OLD WORDING', 800);
  assert.equal((await mod.lookup(db, 'REINSTATED')).length, 1);
});

test('documentation is not missing data, and daily repair replay happens only once', async t => {
  const mod = await implementation();
  const db = database();
  t.after(() => db.sqlite.close());
  await mod.ensureRegisterTables(db);
  db.sqlite.exec("DELETE FROM tm_ingest_repairs");
  const add = db.sqlite.prepare('INSERT INTO tm_ingest_files(name,product,url,state) VALUES (?,?,?,?)');
  add.run('apc260920.zip', 'TRTDXFAP', 'https://example.invalid/daily', 'done');
  add.run('apc18840407-20251231-91.zip', 'TRTYRAP', 'https://example.invalid/archive', 'done');
  add.run('manual.doc', 'TRTDXFAP', 'https://example.invalid/doc', 'skipped');
  await mod.ensureRegisterTables(db);
  assert.equal(db.sqlite.prepare("SELECT state FROM tm_ingest_files WHERE name='apc260920.zip'").get().state, 'waiting');
  db.sqlite.exec("UPDATE tm_ingest_files SET state='done' WHERE name='apc260920.zip'");
  await mod.ensureRegisterTables(db);
  assert.deepEqual((await mod.registerSize(db)).files, [{state: 'done', count: 2}]);
  add.run('broken.zip', 'TRTYRAP', 'https://example.invalid/broken', 'skipped');
  assert.ok((await mod.registerSize(db)).files.some(x => x.state === 'skipped' && x.count === 1));
});
