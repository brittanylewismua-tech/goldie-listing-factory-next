import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/*
  THE FAILURE PATH, DRIVEN RATHER THAN REASONED ABOUT.

  The register lookup failed globally for an unknown period and every one of
  those failures reached the member as "No match was found in the trademark
  records" — a clean result produced by a broken query. These tests force the
  failure and assert the route cannot say that again.
*/
async function route() {
  globalThis.__db = globalThis.__db ?? {};
  const source = readFileSync(new URL('../app/api/trademark/route.ts', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText;
  const check = new URL('../app/trademark-check.ts', import.meta.url).href;
  const record = new URL('../app/trademark-record.ts', import.meta.url).href;
  const preamble = `
    const NextResponse={json:(body,init)=>Response.json(body,init)};
    const withErrorLog=(area,handler)=>handler;
    const getChatGPTUser=async()=>({userId:'member-1',email:'m@example.com'});
    const logError=async()=>{};
    const env={get DB(){return globalThis.__db}};
    const { check, toMatches, withRegister } = await import(${JSON.stringify(check)});
    const { normalize, squeeze } = await import(${JSON.stringify(record)});
    const lookup=async()=>{ if(globalThis.__fail) throw new Error(globalThis.__fail); return globalThis.__hits ?? []; };
    const registerSize=async()=>({ marks: 10, files: [{ state: 'done', count: 1 }] });
  `;
  return import('data:text/javascript;base64,'
    + Buffer.from(preamble + compiled).toString('base64'));
}

const ask = async (mod, phrase) => (await mod.GET(
  new Request(`https://example.com/api/trademark?phrase=${encodeURIComponent(phrase)}`))).json();

test('a register-read failure never presents as a clean result', async () => {
  const mod = await route();
  globalThis.__db = {};
  // The exact production failure, plus the other shapes it can take.
  for (const failure of [
    'D1_ERROR: LIKE or GLOB pattern too complex: SQLITE_ERROR',
    'D1_ERROR: no such column: squeezed',
    'Network connection lost',
    'D1_ERROR: too many SQL variables',
  ]) {
    globalThis.__fail = failure;
    const answer = await ask(mod, 'some phrase nobody owns');

    assert.equal(answer.registerRead, false, `${failure}: the read was reported as successful`);
    assert.match(answer.summary, /could not be read/,
      `${failure}: the member was not told the records were unreadable`);
    // The three things it must never say.
    assert.ok(!/No match was found/i.test(answer.summary), `${failure}: claimed no match was found`);
    assert.ok(!/nothing found/i.test(answer.summary), `${failure}: claimed nothing found`);
    assert.ok(!/available here|currently loaded|could be read,/i.test(answer.summary),
      `${failure}: described a search that did not happen`);
    // And it must not describe itself as clearance.
    assert.match(answer.summary, /not legal clearance/);
  }
});

test('a failure does not suppress the curated answer', async () => {
  const mod = await route();
  globalThis.__db = {};
  globalThis.__fail = 'D1_ERROR: LIKE or GLOB pattern too complex: SQLITE_ERROR';
  // A phrase the curated list knows about must still be reported as risky,
  // because that judgement never needed the register.
  const answer = await ask(mod, 'taylor swift eras tour');
  assert.equal(answer.registerRead, false);
  assert.notEqual(answer.risk, 'clear', 'a known brand went unreported during a register failure');
});

test('a successful read is marked as one', async () => {
  const mod = await route();
  globalThis.__db = {};
  globalThis.__fail = '';
  globalThis.__hits = [];
  const answer = await ask(mod, 'some phrase nobody owns');
  assert.equal(answer.registerRead, true);
  assert.match(answer.summary, /No exact or contained match|No match was found/);
});

test('nothing in the checker caches a verdict', () => {
  /* There is no stored clean result to invalidate, and that must stay true:
     a cached verdict produced during an outage would outlive the outage. */
  for (const file of ['../app/api/trademark/route.ts', '../app/trademark-check.ts']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    assert.equal(/INSERT INTO|platform_cache|caches\.(default|open)/.test(source), false,
      `${file} persists or caches a trademark verdict`);
  }
});
