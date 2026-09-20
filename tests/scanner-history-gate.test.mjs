import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  gateStoredResult, COMPARISON_VERSION, CLAIM_READABLE, CLAIM_HARD_TO_READ,
  CLAIM_LOW_CONTRAST, NOTE_UNMEASURED, NO_GAP,
} from '../app/design-compare.ts';
import { QUALITY_RULE_VERSION } from '../app/image-quality.ts';

/*
  THE STORED RESULT THAT WAS STILL UNSAFE AFTER THE GATE WAS FIXED.

  D1751 corrected the gate that produces a scan. It did nothing for scans
  already in `scan_history`, which are replayed verbatim when a member reopens
  one — so the live history still contained, in a single result:

    "It stays readable at thumbnail size, like the listings that are moving."
    "Its contrast matches the high look that is doing well here."
    "This design's readability has not been measured."

  This is that row, re-gated on the way out.
*/
const storedBefore = () => ({
  ok: true,
  overall: 'Strong visual-pattern alignment',
  working: [
    'Your design uses the bold slogan approach that most listings with verified momentum here are using.',
    CLAIM_READABLE,
    'Its contrast matches the high look that is doing well here.',
  ],
  opportunity: 'Your wording is longer than what is working here.',
  imageQuality: { contrast: 'unverified', sharpness: 'unverified',
    thumbnailReadable: 'unverified',
    notes: ["This design's readability has not been measured. Scan it again with the file to check it."] },
  scanId: 'the-original-row',
});

const quality = (over = {}) => ({
  ruleVersion: QUALITY_RULE_VERSION, contrast: 'pass', tonalRange: 'pass',
  sharpness: 'pass', thumbnailReadable: 'pass', emptiness: 'pass', notes: [],
  mayClaimReadable: true, mayClaimHighContrast: true, ...over,
});

const text = r => [...r.working, r.opportunity].join(' | ');

test('an unmeasured stored result loses both positive claims', () => {
  const { result, changed } = gateStoredResult(storedBefore(), undefined);
  assert.equal(changed, true);
  assert.ok(!/stays readable at thumbnail size/.test(text(result)),
    'the stored readable claim survived with no measurement behind it');
  assert.ok(!/contrast matches/.test(text(result)),
    'the stored contrast claim survived with no measurement behind it');
  /* And no warning invented in its place. */
  assert.ok(!/hard to read at thumbnail size/.test(text(result)));
  assert.ok(!/too close together/.test(text(result)));
  /* The construction point it was entitled to keep is still there. */
  assert.match(result.working[0], /bold slogan approach/);
});

test('the member is told the measurement is missing, not left to infer it', () => {
  const { result } = gateStoredResult(storedBefore(), undefined);
  assert.equal(result.opportunity, NOTE_UNMEASURED);
  assert.equal(result.imageQuality.thumbnailReadable, 'unverified');
  assert.equal(result.imageQuality.contrast, 'unverified');
});

test('the verdict label cannot outlive the claims it rested on', () => {
  /* "Strong" required two supporting points. One of the three was real. */
  const { result } = gateStoredResult(storedBefore(), undefined);
  assert.equal(result.working.length, 1);
  assert.equal(result.overall, 'Moderate visual-pattern alignment');
});

test('a result with nothing left is weak, not strong', () => {
  const { result } = gateStoredResult({
    overall: 'Strong visual-pattern alignment',
    working: [CLAIM_READABLE, 'Its contrast matches the high look that is doing well here.'],
    opportunity: 'Something else entirely.',
  }, undefined);
  assert.deepEqual(result.working, []);
  assert.equal(result.overall, 'Weak visual-pattern alignment');
});

test('a measurement that passes keeps the claims it supports', () => {
  const { result } = gateStoredResult(storedBefore(), quality());
  assert.match(text(result), /stays readable at thumbnail size/);
  assert.match(text(result), /contrast matches/);
  assert.equal(result.overall, 'Strong visual-pattern alignment');
  /* The panel is rewritten from the measurement, so it cannot contradict the
     sentences above it. */
  assert.equal(result.imageQuality.thumbnailReadable, 'pass');
});

test('a stored warning survives only on a measured failure', () => {
  const warned = { ...storedBefore(), working: [], opportunity: CLAIM_HARD_TO_READ };
  assert.equal(gateStoredResult(warned, quality({
    thumbnailReadable: 'fail', mayClaimReadable: false })).result.opportunity,
    CLAIM_HARD_TO_READ);
  /* Measured pass: the warning is unfounded and goes. */
  assert.equal(gateStoredResult(warned, quality()).result.opportunity, NO_GAP);
  /* No measurement: also unfounded, and the note says which. */
  assert.equal(gateStoredResult(warned, undefined).result.opportunity, NOTE_UNMEASURED);
});

test('a stored contrast warning is held to the same rule', () => {
  const warned = { ...storedBefore(), working: [], opportunity: CLAIM_LOW_CONTRAST };
  assert.equal(gateStoredResult(warned, quality({
    contrast: 'fail', mayClaimHighContrast: false })).result.opportunity, CLAIM_LOW_CONTRAST);
  assert.equal(gateStoredResult(warned, quality()).result.opportunity, NO_GAP);
});

test('a stale "could not be measured" note is removed once it is measured', () => {
  const noted = { ...storedBefore(), working: [], opportunity: NOTE_UNMEASURED };
  assert.equal(gateStoredResult(noted, quality()).result.opportunity, NO_GAP);
});

test('a verdict from a superseded rule version is not a measurement', () => {
  /* A "pass" from the rules that measured contrast across the whole image —
     the version that told members crisp black-on-white artwork was
     unreadable. It must not license a claim under the rules that replaced it. */
  const { result } = gateStoredResult(storedBefore(),
    quality({ ruleVersion: QUALITY_RULE_VERSION - 1 }));
  assert.ok(!/stays readable at thumbnail size/.test(text(result)));
  assert.ok(!/contrast matches/.test(text(result)));
  assert.equal(result.opportunity, NOTE_UNMEASURED);
});

test('gating is idempotent: re-gating a gated result changes nothing', () => {
  const once = gateStoredResult(storedBefore(), undefined).result;
  const again = gateStoredResult(once, undefined);
  assert.equal(again.changed, false);
  assert.deepEqual(again.result, once);
});

test('the gated result is stamped, so a reader knows which gate wrote it', () => {
  assert.equal(gateStoredResult(storedBefore(), undefined).result.comparisonVersion,
    COMPARISON_VERSION);
});

test('every scan is stamped as it is written', () => {
  const route = readFileSync(
    new URL('../app/api/design-scanner/scan/route.ts', import.meta.url), 'utf8');
  assert.match(route, /comparisonVersion: COMPARISON_VERSION/);
});

test('history re-gating reads stored rows only — no provider call, no allowance', () => {
  const route = readFileSync(
    new URL('../app/api/design-scanner/scan/route.ts', import.meta.url), 'utf8');
  const get = route.slice(route.indexOf('export const GET'));
  const code = get.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const forbidden of ['fetch(', 'ANALYSIS_MODEL', 'measureQuality', 'decodeTinyPng',
    'reserveSpend', 'settleSpend', 'recordWorkload', 'INSERT INTO', 'UPDATE '])
    assert.ok(!code.includes(forbidden),
      `reopening a saved scan reaches ${forbidden}`);
  /* It re-gates against stored analysis, under the current rule version. */
  assert.match(code, /gateStoredResult/);
  assert.match(code, /FROM scan_uploads/);
  assert.match(code, /ruleVersion === QUALITY_RULE_VERSION/);
});
