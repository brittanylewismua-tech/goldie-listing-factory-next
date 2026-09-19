import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
  A FALSE "BROKEN" IS WORSE THAN NO CHECK.

  The health view reported the trademark backfile broken while it was visibly
  working: marks climbing, queue "Advancing", a file completed an hour
  earlier. The stall test read "no historical file has ever completed" as a
  stall, which is also true of a queue that has just been requeued and of a
  fresh install.

  The next real stall would have looked exactly the same as that noise.
*/
const health = readFileSync(
  new URL('../app/api/operations/health/route.ts', import.meta.url), 'utf8');
const status = readFileSync(
  new URL('../app/api/trademark/register-status/route.ts', import.meta.url), 'utf8');

test('never having finished one is not treated as a stall', () => {
  const stripped = health.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.equal(/backfileWaiting > 0\s*&&\s*\(!backfileAt/.test(stripped), false,
    'an empty completion history counts as a stall again');
  assert.match(stripped, /Boolean\(backfileFrom\) && backfileSince > 6 \* 3_600/);
});

test('with nothing finished, the clock runs from when work last started', () => {
  const stripped = health.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(stripped, /MAX\(started\) AS at FROM tm_ingest_files WHERE priority > 2/);
  assert.match(stripped, /const backfileFrom = backfileAt \|\| seconds\(startedHistorical\?\.at\)/);
});

test('a genuine stall is still reported', () => {
  /* The window and the queued-work condition both have to survive. */
  const stripped = health.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(stripped, /backfileWaiting > 0/);
  assert.match(stripped, /6 \* 3_600/);
  assert.match(stripped, /backfileStalled \? "broken"/);
});

test('requeueing clears the previous run’s timestamps', () => {
  /* Otherwise the stall clock measures from a pass that has already ended. */
  assert.match(status, /started = NULL, finished = NULL/,
    'a requeue leaves stale start and finish times behind');
});
