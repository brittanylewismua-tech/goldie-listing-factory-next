import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalize, squeeze, worthKeeping } from '../app/trademark-record.ts';

/*
  HAUS LABS, AND WHY IT WAS MISSED.

  Reported live: "Hauslabs" returned nothing. So did "Haus Labs". Two separate
  defects had to line up for that, and both are covered here.

  1. Serial 97979817 (HAUS LABS) is registered in International Class 003 —
     cosmetics. Ingestion kept only nine print-on-demand classes, so the mark
     was never stored. A takedown follows the brand, not the Nice class:
     printing it on a shirt gets the listing removed regardless.
  2. Even once stored, "Hauslabs" could not reach "HAUS LABS", because nothing
     related the joined and spaced forms.
*/

const record = (over = {}) => ({
  serial: '97979817', mark: 'HAUS LABS', owner: 'ATE MY HEART INC.',
  registration: '', statusCode: 700, classes: ['003'],
  live: true, drawingCode: '4', ...over,
});

test('a live word mark is kept whatever class it is registered in', () => {
  // The reported miss: cosmetics.
  assert.equal(worthKeeping(record()), true,
    'HAUS LABS (class 003) is still filtered out of the corpus');
  assert.equal(worthKeeping(record({ serial: '97980718' })), true);

  // A panel across classes and eras that a print-on-demand seller can still
  // get removed for. None of these is in the old nine-class set.
  const panel = [
    ['003', 'cosmetics'], ['009', 'software and electronics'],
    ['005', 'pharmaceuticals'], ['030', 'coffee and food'],
    ['032', 'beverages'], ['041', 'entertainment services'],
    ['043', 'restaurants'], ['036', 'financial services'],
  ];
  for (const [code, what] of panel)
    assert.equal(worthKeeping(record({ classes: [code] })), true,
      `a mark in class ${code} (${what}) is excluded from the corpus`);

  // And the print-on-demand classes obviously still qualify.
  for (const code of ['014', '016', '018', '020', '021', '024', '025', '026', '028'])
    assert.equal(worthKeeping(record({ classes: [code] })), true);
});

test('what is excluded is excluded for a reason that is not its class', () => {
  assert.equal(worthKeeping(record({ live: false })), false, 'a dead mark is a warning about nothing');
  assert.equal(worthKeeping(record({ mark: '' })), false);
  assert.equal(worthKeeping(record({ drawingCode: '2' })), false, 'a design-only mark has no words to collide with');
  assert.equal(worthKeeping(record({ mark: 'A' })), false);
  // A mark with no class at all is still a mark.
  assert.equal(worthKeeping(record({ classes: [] })), true);
});

test('the joined and spaced forms of one mark share a key', () => {
  const forms = ['Hauslabs', 'HAUS LABS', 'haus labs', 'Haus  Labs',
    'haus-labs', 'HAUS.LABS', ' Haus Labs ', 'haus_labs', 'HAUS/LABS'];
  const keys = new Set(forms.map(squeeze));
  assert.equal(keys.size, 1, `these did not reduce to one key: ${[...keys].join(' | ')}`);
  assert.equal([...keys][0], 'HAUSLABS');
});

test('equivalence covers the whole list of forms the report named', () => {
  // spaces, hyphens, punctuation, capitalisation, repeated spaces, and words
  // joined or split.
  const cases = [
    ['Cozy Season', 'cozyseason'], ['COZY-SEASON', 'Cozy Season'],
    ['Mama  Bear', 'mamabear'], ["Mama's Bear", 'MAMAS BEAR'],
    ['dog mom', 'DogMom'], ['GIRL POWER!', 'girlpower'],
  ];
  for (const [a, b] of cases)
    assert.equal(squeeze(a), squeeze(b), `${a} and ${b} are not the same mark`);
});

test('squeezing is for equivalence, never for containment', () => {
  // The reason containment must stay on the word-boundary form.
  assert.ok(squeeze('HEART').includes(squeeze('ART')),
    'fixture is wrong: ART should sit inside HEART once squeezed');
  assert.notEqual(squeeze('HEART'), squeeze('ART'),
    'an exact test must still tell these apart');

  const register = readFileSync(new URL('../app/trademark-register.ts', import.meta.url), 'utf8');
  // The SQL may only compare the squeezed column for equality.
  assert.equal(/squeezed\s+LIKE/i.test(register), false,
    'a LIKE on the squeezed column would report ART inside HEART');
  assert.match(register, /squeezed = \?/,
    'the joined form is not matched at all');
});

test('normalization still does what it always did', () => {
  assert.equal(normalize('  COZY   Season. '), 'COZY SEASON');
  assert.equal(normalize("Mama's"), 'MAMAS', 'an apostrophe joins, it does not separate');
  assert.equal(normalize('re-usable'), 'RE USABLE');
});

/* ---- The promise a clean result is allowed to make ---- */

const CHECK = readFileSync(new URL('../app/trademark-check.ts', import.meta.url), 'utf8');
const sentences = CHECK.replace(/\/\*[\s\S]*?\*\//g, '');

test('no clean result claims the entire federal register was searched', () => {
  // This is the sentence that was wrong: it promised the federal register
  // while ingestion held nine classes out of forty-five.
  assert.equal(/current federal[\s"+\n]*trademark register/i.test(sentences), false,
    'a clean result still claims the whole federal register was searched');
  assert.equal(/\bthe entire (federal )?register\b/i.test(sentences), false);
});

test('every clean result says what was searched and that it is not clearance', () => {
  const clean = [
    'No match was found in the trademark records currently loaded',
    'available here',
    'that could be read',
  ];
  for (const phrase of clean)
    assert.ok(sentences.includes(phrase), `the wording for one register state is missing: ${phrase}`);
  // Screening, never clearance — in all of them.
  const clearances = sentences.match(/not legal\s*"?\s*\+?\s*"?\s*clearance/g) ?? [];
  assert.ok(clearances.length >= 3,
    `only ${clearances.length} clean-result sentences carry the clearance caveat`);
});

test('the corpus is described by what it holds, not by what it filters', () => {
  const record_ = readFileSync(new URL('../app/trademark-record.ts', import.meta.url), 'utf8');
  // PRINTED_CLASSES may still exist for ranking, but must not gate keeping.
  const keep = /export function worthKeeping[\s\S]*?\n}/.exec(record_)[0];
  assert.equal(/PRINTED_CLASSES/.test(keep), false,
    'class membership still decides whether a mark is stored');
});

/* ---- End to end, through the real lookup ---- */

/*
  The module imports through the "@/app" alias, which node cannot resolve, so
  it is compiled here with its imports replaced. The function under test is
  still the deployed one rather than a restatement of it.
*/
async function realLookup() {
  const ts = (await import('typescript')).default;
  const source = readFileSync(new URL('../app/trademark-register.ts', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace(/^export \{[^}]*\} from ["'][^"']+["'];?$/gm, '');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText;
  const record = new URL('../app/trademark-record.ts', import.meta.url).href;
  const preamble = `const { normalize, squeeze, readRecord, worthKeeping } = await import(${JSON.stringify(record)});\n`;
  const mod = await import('data:text/javascript;base64,'
    + Buffer.from(preamble + compiled).toString('base64'));
  return mod.lookup;
}

const fakeDb = stored => ({ prepare: () => ({ bind: (normalized, prefix, squeezed, firstWord) => ({
  all: async () => ({ results: stored.filter(row =>
    row.normalized === normalized
    || row.normalized.startsWith(String(prefix).replace(/%$/, ''))
    || row.normalized === firstWord
    || row.squeezed === squeezed) }),
}) }) });

test('a joined phrase reaches a spaced mark through the real lookup', async () => {
  const lookup = await realLookup();
  const db = fakeDb([
    { mark: 'HAUS LABS', normalized: 'HAUS LABS', squeezed: 'HAUSLABS',
      owner: 'ATE MY HEART INC.', serial: '97979817', registration: 'R1',
      classes: '003', status_code: 700 },
  ]);
  for (const phrase of ['Hauslabs', 'Haus Labs', 'haus labs', 'HAUS-LABS', 'haus  labs', 'HAUSLABS']) {
    const hits = await lookup(db, phrase);
    const found = hits.find(hit => hit.serial === '97979817');
    assert.ok(found, `"${phrase}" did not find HAUS LABS`);
    assert.equal(found.mark, 'HAUS LABS');
  }
});

test('squeezing does not invent a containment hit', async () => {
  const lookup = await realLookup();
  const db = fakeDb([{ mark: 'ART', normalized: 'ART', squeezed: 'ART', owner: 'x',
    serial: '2', registration: 'R3', classes: '025', status_code: 700 }]);
  // "HEART" contains "ART" only once the spaces are gone, which must not count.
  assert.equal((await lookup(db, 'heart')).length, 0,
    'ART was reported as sitting inside HEART');
  assert.equal((await lookup(db, 'art')).length, 1);
});

test('no lookup pattern is ever built from a column', () => {
  /*
    The defect this guards: `?1 LIKE normalized || ' %'` built its LIKE pattern
    out of stored data, so the pattern's complexity grew with the table. Past a
    couple of hundred thousand marks D1 answered "LIKE or GLOB pattern too
    complex" for EVERY lookup, and the caller's bare catch turned that into
    "no match was found". The register half of the checker was dead while it
    reported clean results.
  */
  const register = readFileSync(new URL('../app/trademark-register.ts', import.meta.url), 'utf8');
  const sql = register.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/LIKE\s+\w+\s*\|\|/.test(sql), false,
    'a LIKE pattern is being concatenated from a column again');
  assert.equal(/\?\d\s+LIKE\s+normalized/.test(sql), false,
    'the phrase is being matched against a column-derived pattern');
  // The remaining LIKE must take its pattern from a bound parameter.
  assert.match(sql, /normalized LIKE \?2/);
});

test('a single-word mark at the head of a phrase is still found', async () => {
  const lookup = await realLookup();
  // BLUEY inside "bluey birthday shirt" — the case the removed clause covered.
  const db = fakeDb([{ mark: 'BLUEY', normalized: 'BLUEY', squeezed: 'BLUEY',
    owner: 'BBC', serial: '3', registration: 'R4', classes: '025', status_code: 700 }]);
  const hits = await lookup(db, 'bluey birthday shirt');
  assert.equal(hits.length, 1, 'a single-word mark heading the phrase was lost');
  assert.equal(hits[0].mark, 'BLUEY');
});
