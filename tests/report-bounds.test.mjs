import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedReportBody, MAX_REPORT_BYTES, QUIET_REPORTER_RESERVE,
  reportCeilingReached, REPORTS_PER_AREA_PER_HOUR } from '../app/log-scrubbing.ts';

const post = (body, headers = {}) =>
  new Request('https://example.com/api/client-errors',
    { method: 'POST', body, headers: { 'content-type': 'application/json', ...headers } });

test('a report body is read only up to a bound', async () => {
  const small = await boundedReportBody(post(JSON.stringify({ message: 'it broke' })));
  assert.equal(small.message, 'it broke');

  // Well past the bound: refused rather than parsed.
  const huge = JSON.stringify({ message: 'x'.repeat(MAX_REPORT_BYTES * 4) });
  assert.equal(await boundedReportBody(post(huge)), null);
});

test('a lying Content-Length does not buy a bigger body', async () => {
  // The declared length is small; the actual stream is not. The reader counts
  // as it goes, so the lie is caught partway through rather than believed.
  const huge = 'x'.repeat(MAX_REPORT_BYTES * 3);
  const request = post(JSON.stringify({ message: huge }), { 'content-length': '12' });
  assert.equal(await boundedReportBody(request), null);
});

test('malformed JSON is an answer, not a crash', async () => {
  assert.equal(await boundedReportBody(post('{not json')), null);
  assert.equal(await boundedReportBody(post('')), null);
});

/* A counting stand-in for the error_log table. */
function logDb(rows) {
  return {
    prepare: () => ({
      bind: (areaPattern, contextPattern) => ({
        first: async () => {
          const area = areaPattern.replace(/%$/, '');
          const source = contextPattern && /"src":"([^"]+)"/.exec(contextPattern)?.[1];
          const matching = rows.filter(row => row.area.startsWith(area)
            && (!source || row.source === source));
          return { n: matching.length };
        },
      }),
    }),
  };
}

test('one source cannot fill the area ceiling and silence everyone else', async () => {
  // An attacker rotates sources and fills the hour.
  const flood = Array.from({ length: REPORTS_PER_AREA_PER_HOUR },
    (unused, index) => ({ area: 'browser/error', source: `bot-${index}` }));

  // The area ceiling is reached.
  assert.equal(await reportCeilingReached(logDb(flood), 'browser'), true);

  // A member who has reported nothing this hour is still heard.
  assert.equal(await reportCeilingReached(logDb(flood), 'browser', 'a-real-member'), false,
    'a flood from other sources suppressed a first report');

  // And one who has already sent a couple is still heard.
  const withTwo = [...flood,
    { area: 'browser/error', source: 'a-real-member' },
    { area: 'browser/error', source: 'a-real-member' }];
  assert.equal(await reportCeilingReached(logDb(withTwo), 'browser', 'a-real-member'), false);

  // The source that IS flooding is turned away once past its reserve.
  const noisy = [...flood, ...Array.from({ length: QUIET_REPORTER_RESERVE },
    () => ({ area: 'browser/error', source: 'bot-0' }))];
  assert.equal(await reportCeilingReached(logDb(noisy), 'browser', 'bot-0'), true,
    'the source filling the area was not bounded');
});

test('below the area ceiling, a single source is still held to its own limit', async () => {
  const mine = Array.from({ length: 60 },
    () => ({ area: 'browser/error', source: 'one-loud-page' }));
  assert.equal(await reportCeilingReached(logDb(mine), 'browser', 'one-loud-page'), true);
  assert.equal(await reportCeilingReached(logDb(mine), 'browser', 'somebody-else'), false);
});

test('a counter that will not read never drops a real report', async () => {
  const broken = { prepare: () => ({ bind: () => ({ first: async () => { throw new Error('no table'); } }) }) };
  assert.equal(await reportCeilingReached(broken, 'browser', 'a-member'), false);
});
