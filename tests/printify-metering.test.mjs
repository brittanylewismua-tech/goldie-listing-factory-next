import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { registerHooks } from 'node:module';

/*
  PRINTIFY CALLS WERE NOT COUNTED AT ALL.

  Etsy traffic has been metered since the beginning — `recordEtsyCall` writes an
  hourly bucket per response, with a feature label. Printify went out through
  bare `fetch` in about thirty modules: no counter, no label, no status, no
  record. Asked how many Printify calls an acceptance sweep made, the only
  answer available was a hand count that nothing in the product could check.

  These tests hold the wrapper to what it promises: it records the shape of a
  call, it records nothing sensitive, it never fails the member's request, and
  no module is allowed to go around it.
*/

/* A D1 stand-in that keeps what it was asked to store, so the assertions can
   look at the actual bound values rather than at a mock's expectations. */
const rows = [];
let failWrites = false;
const statement = (sql) => ({
  sql, args: [],
  bind(...args) { this.args = args; return this; },
  async run() {
    if (failWrites) throw new Error('D1 is unavailable');
    if (/INSERT INTO printify_api_calls/.test(this.sql)) rows.push(this.args);
    return { success: true };
  },
  async first() { return null; },
  async all() { return { results: [] }; },
});
const DB = {
  prepare: (sql) => statement(sql),
  batch: async (statements) => statements.map(() => ({ success: true })),
};

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers')
    return { url: 'data:text/javascript,export const env=globalThis.__testEnv;', shortCircuit: true };
  return next(specifier, context);
} });
globalThis.__testEnv = { DB };

const { printifyCall, printifyCategory, meteredPrintifyFetch } =
  await import('../app/printify-call.ts');

const record = () => rows[rows.length - 1];
const field = (index) => record()[index];
/* id, at, feature, method, category, status, attempt, user_id */
const FEATURE = 2, METHOD = 3, CATEGORY = 4, STATUS = 5, ATTEMPT = 6, USER = 7;

const ok = (body = '{}') => async () => new Response(body, { status: 200 });

test('a call is recorded with its feature, method, category, status and member', async () => {
  rows.length = 0;
  await printifyCall('https://api.printify.com/v1/shops/1374648/products/abc123.json',
    { headers: { Authorization: 'Bearer secret-token-value' } },
    { feature: 'listing-factory', userId: 'member-1', fetcher: ok() });
  assert.equal(rows.length, 1);
  assert.equal(field(FEATURE), 'listing-factory');
  assert.equal(field(METHOD), 'GET');
  assert.equal(field(CATEGORY), 'products');
  assert.equal(field(STATUS), 200);
  assert.equal(field(ATTEMPT), 1);
  assert.equal(field(USER), 'member-1');
});

test('nothing sensitive is stored: no token, no body, no url, no ids from the path', async () => {
  rows.length = 0;
  const token = 'pk_live_thisisatoken';
  const body = JSON.stringify({ file_name: 'design.png', url: 'https://artwork.example/secret.png' });
  await printifyCall('https://api.printify.com/v1/uploads/images.json',
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body },
    { feature: 'listing-factory', userId: 'member-1', fetcher: ok() });
  const stored = JSON.stringify(record());
  for (const secret of [token, body, 'artwork.example', 'secret.png', 'design.png',
    'api.printify.com', '/v1/uploads/images.json', 'Authorization', 'Bearer'])
    assert.ok(!stored.includes(secret), `the meter stored "${secret}"`);
  /* What it does keep is the shape of the call. */
  assert.equal(field(CATEGORY), 'uploads');
  assert.equal(field(METHOD), 'POST');
});

test('the endpoint category is derived, and never the endpoint itself', () => {
  const cases = [
    ['https://api.printify.com/v1/shops.json', 'shops'],
    ['https://api.printify.com/v1/shops/1374648/products.json?limit=50&page=2', 'products'],
    ['https://api.printify.com/v1/shops/1374648/products/6aa6ec82.json', 'products'],
    ['https://api.printify.com/v1/shops/1374648/orders.json?limit=50', 'orders'],
    ['https://api.printify.com/v1/shops/1/products/2/publish.json', 'publishing'],
    ['https://api.printify.com/v1/uploads/images.json', 'uploads'],
    ['https://api.printify.com/v1/catalog/blueprints/269.json', 'catalog'],
    ['https://api.printify.com/v1/webhooks.json', 'other'],
  ];
  for (const [url, expected] of cases)
    assert.equal(printifyCategory(url), expected, url);
});

test('a retry is counted as a retry, not as extra volume', async () => {
  rows.length = 0;
  for (const attempt of [1, 2, 3])
    await printifyCall('https://api.printify.com/v1/shops/1/products.json', undefined,
      { feature: 'listing-factory', attempt, fetcher: ok() });
  assert.deepEqual(rows.map(row => row[ATTEMPT]), [1, 2, 3]);
});

test('a call that never got a status is still recorded, as no-response', async () => {
  rows.length = 0;
  await assert.rejects(() => printifyCall('https://api.printify.com/v1/shops.json', undefined,
    { feature: 'connections', fetcher: async () => { throw new Error('network down'); } }));
  assert.equal(rows.length, 1, 'a failed call vanished from the ledger');
  assert.equal(field(STATUS), 0);
});

test('a failing meter never fails the member request', async () => {
  rows.length = 0;
  failWrites = true;
  try {
    const response = await printifyCall('https://api.printify.com/v1/shops.json', undefined,
      { feature: 'qa', fetcher: ok('{"ok":true}') });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  } finally { failWrites = false; }
});

test('the response is handed back untouched, so behaviour is unchanged', async () => {
  const fetcher = async () => new Response('{"id":"abc"}',
    { status: 201, headers: { 'x-printify': 'yes' } });
  const response = await printifyCall('https://api.printify.com/v1/shops/1/products.json',
    { method: 'POST' }, { feature: 'listing-factory', fetcher });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('x-printify'), 'yes');
  assert.deepEqual(await response.json(), { id: 'abc' });
});

test('the injected-fetcher modules meter by default rather than on request', async () => {
  rows.length = 0;
  const metered = meteredPrintifyFetch({ feature: 'listing-factory', fetcher: ok() });
  await metered('https://api.printify.com/v1/shops/1/products.json');
  assert.equal(rows.length, 1);
  assert.equal(field(FEATURE), 'listing-factory');
});

test('no module reaches Printify around the wrapper', () => {
  const hits = execSync(
    "grep -rn 'api.printify.com' app worker --include=*.ts --include=*.tsx || true",
    { cwd: new URL('..', import.meta.url).pathname }).toString().trim().split('\n').filter(Boolean);
  const offenders = hits.filter(line => {
    const [file, , ...rest] = line.split(':');
    const text = rest.join(':');
    if (file.endsWith('printify-call.ts')) return false;
    /* A bare `fetch` on the same line as the Printify host is the shape that
       escaped counting. An injected `fetcher` is checked separately below:
       those modules take their caller's fetcher so they can be tested without
       a network, and what matters there is that the default, and every call
       site, is metered. */
    return /await\s+fetch\(|=\s*fetch\(/.test(text);
  });
  assert.deepEqual(offenders, [],
    'these reach Printify without going through printifyCall:\n' + offenders.join('\n'));
});

test('the four injected-fetcher modules default to a metered fetcher', () => {
  const base = new URL('../app/api/printify/', import.meta.url);
  for (const file of ['created-product-details.ts', 'product-creation.ts',
    'reconcile-draft-job.ts', 'etsy-sku-preflight.ts']) {
    const src = readFileSync(new URL(file, base), 'utf8');
    assert.ok(!/typeof fetch\s*=\s*fetch/.test(src),
      `${file} still defaults its fetcher to bare fetch, so its calls are invisible`);
    assert.match(src, /meteredPrintifyFetch/);
  }
});

test('the one module with no default fetcher is only ever given a metered one', () => {
  const root = new URL('../', import.meta.url).pathname;
  const state = readFileSync(root + 'app/api/printify/publish-state.ts', 'utf8');
  /* It deliberately has no default: publishing costs money and this module is
     given whichever fetcher the caller is accountable for. */
  assert.ok(!/typeof fetch\s*=\s*fetch/.test(state));
  const sites = execSync(
    "grep -rn 'readPrintifyPublishState(' app worker --include=*.ts | grep -v 'export async function'",
    { cwd: root }).toString().trim().split('\n').filter(Boolean);
  assert.ok(sites.length >= 3, 'the call sites moved; re-check them');
  for (const site of sites)
    assert.ok(/meteredPrintifyFetch|printifyCall/.test(site),
      'a publish-state read is given an unmetered fetcher:\n' + site);
});

test('the reporting refuses to imply anything about calls made before it existed', () => {
  const src = readFileSync(new URL('../app/printify-usage.ts', import.meta.url), 'utf8');
  /* The window can never start before the meter did, and the answer says so. */
  assert.match(src, /Math\.max\(from, since\)/);
  assert.match(src, /before: "unmeasured"/);
  assert.match(src, /unmeasured, not zero/);
});
