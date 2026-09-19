import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BRIEF_REFRESH_SECONDS, FAILING_AFTER, FAILING_BACKOFF_SECONDS,
  INACTIVE_AFTER_SECONDS, INACTIVE_REFRESH_SECONDS, classify, order,
} from '../app/niche-brief-refresh.ts';
import { NICHE_STATES } from '../app/niche-brief-state.ts';

const NOW = 1_789_800_000;
const niche = (over = {}) => ({
  key: 'dog+mom', terms: ['dog', 'mom'],
  lastOpened: NOW - 3_600, lastBriefAt: NOW - 600,
  consecutiveFailures: 0, lastAttemptAt: NOW - 600, ...over,
});

test('a brief inside its window is fresh; past it, it is due', () => {
  assert.equal(classify(niche(), NOW), 'fresh');
  assert.equal(classify(niche({ lastBriefAt: NOW - BRIEF_REFRESH_SECONDS - 1 }), NOW), 'due');
  // A niche that has never had a brief is due, not fresh by default.
  assert.equal(classify(niche({ lastBriefAt: 0 }), NOW), 'due');
});

test('the refresh window sits well inside the line the member’s screen uses', () => {
  // The list calls a brief stale at 36 hours. Refreshing at that same interval
  // would mean one missed run puts a niche over the line.
  assert.ok(BRIEF_REFRESH_SECONDS * 2 <= 36 * 3_600,
    'a single missed run could push a niche past the staleness line');
});

test('a niche nobody reads is slowed down, not abandoned', () => {
  const ignored = { lastOpened: NOW - INACTIVE_AFTER_SECONDS - 86_400 };
  // Still fresh on the slower cadence...
  assert.equal(classify(niche({ ...ignored, lastBriefAt: NOW - INACTIVE_REFRESH_SECONDS + 60 }), NOW), 'fresh');
  // ...but it does come round again, rather than never being rebuilt.
  assert.equal(classify(niche({ ...ignored, lastBriefAt: NOW - INACTIVE_REFRESH_SECONDS - 60 }), NOW), 'due');
  assert.ok(INACTIVE_REFRESH_SECONDS > BRIEF_REFRESH_SECONDS);
});

test('repeated failures back off instead of consuming a slot every run', () => {
  const broken = { consecutiveFailures: FAILING_AFTER, lastAttemptAt: NOW - 60, lastBriefAt: 0 };
  assert.equal(classify(niche(broken), NOW), 'failing');
  // It is not abandoned either: after the backoff it is due again.
  assert.equal(
    classify(niche({ ...broken, lastAttemptAt: NOW - FAILING_BACKOFF_SECONDS - 60 }), NOW), 'due');
  // One or two failures do not trigger backoff.
  assert.equal(classify(niche({ consecutiveFailures: FAILING_AFTER - 1,
    lastAttemptAt: NOW - 60, lastBriefAt: 0 }), NOW), 'due');
});

test('the queue serves never-built first, then oldest, then most-recently-read', () => {
  const rows = [
    niche({ key: 'old', lastBriefAt: NOW - 40 * 3_600, lastOpened: NOW - 100 }),
    niche({ key: 'never', lastBriefAt: 0 }),
    niche({ key: 'older', lastBriefAt: NOW - 90 * 3_600, lastOpened: NOW - 100 }),
    niche({ key: 'fresh-one', lastBriefAt: NOW - 60 }),
  ];
  assert.deepEqual(order(rows, NOW).map(row => row.key), ['never', 'older', 'old'],
    'a fresh niche was queued, or the order is wrong');
});

test('two niches equally stale are separated by who is actually reading them', () => {
  const rows = [
    niche({ key: 'ignored', lastBriefAt: NOW - 40 * 3_600, lastOpened: NOW - 20 * 86_400 }),
    niche({ key: 'read-today', lastBriefAt: NOW - 40 * 3_600, lastOpened: NOW - 3_600 }),
  ];
  assert.deepEqual(order(rows, NOW).map(row => row.key), ['read-today', 'ignored']);
});

test('every state the accounting reports is distinct and nameable', () => {
  for (const state of ['fresh', 'due', 'failing', 'processing', 'unavailable'])
    assert.ok(NICHE_STATES.includes(state), `${state} is missing`);
  assert.equal(new Set(NICHE_STATES).size, NICHE_STATES.length);
});

/* ---- The worker route ---- */

const ROUTE = readFileSync(
  new URL('../app/api/market/niche-brief-tick/route.ts', import.meta.url), 'utf8');
const withoutComments = ROUTE.replace(/\/\*[\s\S]*?\*\//g, '');

test('the rebuild is deduplicated by niche, not repeated per watcher', () => {
  assert.match(ROUTE, /GROUP BY w\.niche_key/,
    'without grouping, a niche is rebuilt once per member holding it');
  assert.match(ROUTE, /COUNT\(DISTINCT w\.user_id\)/,
    'the run does not report how many watchers one rebuild served');
});

test('a niche with no movement is recorded as unavailable, never as a failure', () => {
  assert.match(withoutComments, /"unavailable"/);
  assert.match(withoutComments, /moving[\s\S]{0,80}>\s*0\s*\?\s*"fresh"\s*:\s*"unavailable"/,
    'an empty niche is not distinguished from a broken one');
});

test('the run states its provider cost, and genuinely makes no call', () => {
  assert.match(withoutComments, /etsyCalls:\s*0/);
  assert.match(withoutComments, /paidProviderCalls:\s*0/);
  assert.equal(/\bfetch\s*\(/.test(withoutComments), false,
    'this path makes an outbound call');
});

test('the tick is internal-only, by the same proof the other cron routes use', () => {
  assert.match(withoutComments, /cf-connecting-ip/);
  assert.match(withoutComments, /isOwner/);
});

test('the six-hour evidence rule is not touched by any of this', () => {
  const refresh = readFileSync(
    new URL('../app/niche-brief-refresh.ts', import.meta.url), 'utf8');
  assert.equal(/DISPLAY_FRESHNESS|displayFresh/.test(refresh), false,
    'the refresh system is entangled with the evidence display rule');
  const brief = readFileSync(new URL('../app/niche-brief.ts', import.meta.url), 'utf8');
  assert.match(brief, /DISPLAY_FRESHNESS_SECONDS/,
    'the brief no longer applies the six-hour display rule');
});

test('the tick actually runs on the schedule, and is exempt as an internal call', () => {
  const cron = readFileSync(
    new URL('../scripts/add-scheduled-handler.mjs', import.meta.url), 'utf8');
  assert.match(cron, /\/api\/market\/niche-brief-tick/,
    'the job exists but nothing calls it');
  const surfaces = readFileSync(
    new URL('../app/request-surfaces.ts', import.meta.url), 'utf8');
  assert.match(surfaces, /\/api\/market\/niche-brief-tick/,
    'the scheduled call would be rate limited as if it were a member');
});

/* ---- Capacity: the property that decides whether this closes ---- */

test('sustained completion rate exceeds the rate at which briefs fall due', () => {
  const PER_RUN = Number(/const PER_RUN = (\d+)/.exec(ROUTE)[1]);
  const RUN_EVERY_SECONDS = 20 * 60;   // the */20 cron
  const runsPerWindow = BRIEF_REFRESH_SECONDS / RUN_EVERY_SECONDS;
  const completionsPerWindow = PER_RUN * runsPerWindow;

  // Each saved niche falls due exactly once per refresh window, so the number
  // of distinct niches IS the creation rate per window.
  assert.ok(completionsPerWindow >= 100,
    `only ${completionsPerWindow} rebuilds per window; that supports too few niches`);
  assert.ok(completionsPerWindow / 7 > 10,
    'no meaningful headroom over the current roster of seven');

  // The queue must drain rather than grow, from a cold start with all due.
  for (const niches of [7, 50, 200]) {
    let due = niches;
    for (let run = 0; run < runsPerWindow; run++) due = Math.max(0, due - PER_RUN);
    assert.equal(due, 0, `${niches} niches do not drain within one window`);
  }
});

test('the accounting reports each state separately rather than one number', () => {
  const health = readFileSync(
    new URL('../app/api/operations/health/route.ts', import.meta.url), 'utf8');
  assert.match(health, /nicheBriefs/);
  for (const state of NICHE_STATES)
    assert.ok(health.includes(state), `${state} is not reported`);
  // The conflation that hid this defect: images healthy while briefs were not.
  assert.match(health, /referenceImages/);
});
