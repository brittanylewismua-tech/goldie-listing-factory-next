import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { registerHooks } from 'node:module';

/*
  SIXTEEN READS WERE RECORDED AS PUBLISHES.

  `etsyFetch` defaulted its feature label to "publish". Every call made without
  an explicit label — shipping-profile reads, listing reads, inventory checks —
  landed in the publish bucket. Live, the ledger showed 16 calls labelled
  `publish` on a day when `publishedToday` was 0: the one distinction the
  counter exists to make was the one it could not make.

  The label is now required. A call without one does not compile, and these
  tests hold the call sites to labels that are true.
*/
const root = new URL('../', import.meta.url).pathname;
const read = p => readFileSync(root + p, 'utf8');

const FEATURES = ["publish","photos","search","taxonomy","shipping","connect","qa",
  "finance","shop-watch","listings","partners","unlabelled"];

test('etsyFetch has no default feature: omitting one is a type error', () => {
  const client = read('app/api/etsy/client.ts');
  const signature = /export async function etsyFetch<T>\(([^)]*)\)/.exec(client);
  assert.ok(signature, 'the etsyFetch signature moved');
  assert.match(signature[1], /feature:EtsyFeature[,)]/,
    'feature is not a required parameter of etsyFetch');
  assert.ok(!/feature:EtsyFeature\s*=/.test(signature[1]),
    'feature has a default again, so an unlabelled call silently becomes one');
  /* And specifically not the old default. */
  assert.ok(!/feature:EtsyFeature="publish"/.test(client));
});

test('every etsyFetch call site names its feature', () => {
  const files = execSync("grep -rl 'etsyFetch' app worker --include=*.ts --include=*.tsx",
    { cwd: root }).toString().trim().split('\n');
  const unlabelled = [];
  for (const file of files) {
    /* Comments mention etsyFetch by name; they are not call sites. */
    const src = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const call = /etsyFetch\s*(<[^(]*?>)?\s*\(/g;
    let match;
    while ((match = call.exec(src))) {
      const before = src.slice(Math.max(0, match.index - 40), match.index);
      if (/import|=>\s*$|function\s*$/.test(before)) continue;
      let depth = 1, i = match.index + match[0].length, quote = null;
      for (; i < src.length && depth > 0; i++) {
        const c = src[i];
        if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
        if (c === '"' || c === "'" || c === '`') quote = c;
        else if ('([{'.includes(c)) depth++;
        else if (')]}'.includes(c)) depth--;
      }
      const args = src.slice(match.index + match[0].length, i - 1);
      if (!FEATURES.some(f => args.includes(`"${f}"`) || args.includes(`'${f}'`)))
        unlabelled.push(`${file} :: etsyFetch(${args.slice(0, 90)}…`);
    }
  }
  /* shop-match.ts is the one exception and it is not an exception to the rule:
     it receives etsyFetch as an injected dependency, and each of its three
     call sites hands it a closure labelled "connect". */
  const allowed = unlabelled.filter(entry => !entry.startsWith('app/api/printify/shop-match.ts'));
  assert.deepEqual(allowed, [],
    'these Etsy calls carry no feature label:\n' + allowed.join('\n'));
  for (const site of execSync(
    "grep -rn 'verifyShopPairing({' app --include=*.ts", { cwd: root })
    .toString().trim().split('\n'))
    assert.match(site, /etsyFetch<T>\(path,token,"connect"\)/,
      'a shop-pairing call injects an unlabelled etsyFetch:\n' + site);
});

test('reads are labelled as reads, and only writes are labelled publish', () => {
  /* The calls that were being counted as publishing. Each named with what it
     actually is, so the ledger can answer "did anything publish today". */
  const expectations = [
    ['app/api/etsy/shipping-profiles/route.ts', 'shipping'],
    ['app/api/etsy/taxonomy/route.ts', 'taxonomy'],
    ['app/api/etsy/production-partners/route.ts', 'partners'],
    ['app/api/etsy/callback/route.ts', 'connect'],
    ['app/api/mastermind/member-diagnostic/route.ts', 'qa'],
  ];
  for (const [file, feature] of expectations) {
    const src = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(src.includes(`"${feature}"`) || src.includes(`'${feature}'`),
      `${file} does not label its Etsy calls "${feature}"`);
    assert.ok(!/etsyFetch[^;]*"publish"/.test(src),
      `${file} still records a read as publishing`);
  }
  /* And the publish path keeps its label, because those genuinely publish. */
  const finish = read('app/api/etsy/finish.ts');
  assert.match(finish, /listings\/\$\{listingId\}`,token,"publish",\{method:"PATCH"/);
});

test('the meter records the feature it was given, not a default', async () => {
  const recorded = [];
  const statement = (sql) => ({ sql, args: [],
    bind(...args) { this.args = args; return this; },
    async run() { return { success: true }; },
    async first() { return { qps_limit: 10, paused_until: 0, next_at_ms: 0 }; },
    async all() { return { results: [] }; } });
  const DB = { prepare: (sql) => statement(sql),
    async batch(statements) {
      for (const entry of statements)
        if (/etsy_api_usage_buckets/.test(entry.sql)) recorded.push(entry.args);
      return statements.map(() => ({ success: true }));
    } };
  registerHooks({ resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers')
      return { url: 'data:text/javascript,export const env=globalThis.__etsyTestEnv;', shortCircuit: true };
    /* The app compiles with extensionless relative imports; Node's resolver
       does not, so the sibling modules are pointed at explicitly. */
    if (/^\.{1,2}\/[^.]*$/.test(specifier) && context.parentURL?.includes('/app/'))
      return next(specifier + '.ts', context);
    return next(specifier, context);
  } });
  globalThis.__etsyTestEnv = { DB, ETSY_API_KEY: 'k', ETSY_API_SECRET: 's' };

  const { recordEtsyCall } = await import('../app/api/etsy/client.ts');
  await recordEtsyCall(new Response('', { status: 200 }), 'shipping');
  await recordEtsyCall(new Response('', { status: 200 }), 'publish');
  /* bucket, feature, rate_limited, qpd_limit */
  assert.deepEqual(recorded.map(args => args[1]), ['shipping', 'publish']);
});
