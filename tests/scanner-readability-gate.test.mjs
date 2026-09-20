import test from 'node:test';
import assert from 'node:assert/strict';
import { compare } from '../app/design-compare.ts';

/*
  THE EXACT LIVE STATE THIS REPRODUCES.

  A real scan on the deployed site returned, in one result:

    "This design's readability has not been measured. Scan it again with the
     file to check it."
    "It stays readable at thumbnail size, like the listings that are moving."
    "Its contrast matches the high look that is doing well here."

  The PNG decode had failed, so there was no measurement at all. Both gates
  asked whether a measurement OBJECTED: `measuredUnverified` looked inside a
  verdict that did not exist, and the contrast gate read
  `!measured || mayClaimHighContrast`, so an ABSENT measurement actively
  permitted the claim. The model's opinion walked through both.

  Three states, and only three. A positive claim needs a measured pass. A
  warning needs a measured fail. Unknown claims nothing in either direction.
*/
const ingredients = (over = {}) => ({
  wordCount: 2, typography: 'serif', textHierarchy: 'single line',
  layout: 'centred', illustration: 'none', textToArt: 1,
  colorStrategy: 'two tone', contrast: 'high', thumbnailReadability: 'readable',
  density: 'roomy', printCoverage: 0.5, mechanism: 'bold slogan', ...over,
});
const cohort = Array.from({ length: 14 }, () => ingredients());
const design = ingredients();

const quality = (over = {}) => ({
  contrast: 'pass', tonalRange: 'pass', sharpness: 'pass',
  thumbnailReadable: 'pass', emptiness: 'pass', notes: [],
  mayClaimReadable: true, mayClaimHighContrast: true, ...over,
});

const said = out => [...out.working, out.opportunity].join(' | ');

test('no measurement at all claims nothing about readability or contrast', () => {
  /* The live case: the decode failed, so `measured` was undefined. */
  const text = said(compare(design, cohort, {}));
  assert.ok(!/stays readable at thumbnail size/.test(text),
    'an unmeasured design is still told it reads well');
  assert.ok(!/contrast matches/.test(text),
    'an unmeasured design is still told its contrast matches');
  assert.ok(!/gets hard to read/.test(text),
    'an unmeasured design is told it reads badly, which is equally unfounded');
});

test('an unverified measurement is treated exactly like no measurement', () => {
  const text = said(compare(design, cohort,
    { measured: quality({ thumbnailReadable: 'unverified', contrast: 'unverified' }) }));
  assert.ok(!/stays readable at thumbnail size/.test(text));
  assert.ok(!/contrast matches/.test(text));
  assert.ok(!/gets hard to read/.test(text));
});

test('an unmeasured design is told the comparison is about construction', () => {
  /* Nothing else is wrong with this design, so the note is the top gap. */
  const out = compare(design, cohort, {});
  assert.match(out.opportunity, /could not be measured/);
  assert.match(out.opportunity, /construction/);
});

test('a measured pass may support the positive claim', () => {
  /* `working` is capped at three by design, so the fixture differs on
     mechanism to leave room for the contrast line rather than having it
     trimmed and mistaken for a suppressed claim. */
  const off = { ...design, mechanism: 'illustration', printCoverage: 0.95 };
  const text = said(compare(off, cohort, { measured: quality() }));
  assert.match(text, /stays readable at thumbnail size/);
  assert.match(text, /contrast matches/);
  assert.ok(!/could not be measured/.test(text));
});

test('a measured fail produces the warning, whatever the model said', () => {
  /* The model still calls this design readable and high contrast. */
  const text = said(compare(design, cohort, {
    measured: quality({ mayClaimReadable: false, mayClaimHighContrast: false,
      contrast: 'fail', thumbnailReadable: 'fail',
      notes: ['The light and dark areas in this design are too close together to read easily.'] }) }));
  assert.match(text, /gets hard to read at thumbnail size/);
  assert.ok(!/stays readable at thumbnail size/.test(text),
    'the model overrode a measured failure');
  assert.ok(!/contrast matches/.test(text));
});

test('the model alone cannot assert unreadable when the pixels passed', () => {
  /* Measured pass, model disagrees: no positive claim, and no warning
     invented out of an opinion. */
  const text = said(compare({ ...design, thumbnailReadability: 'hard' }, cohort,
    { measured: quality() }));
  assert.ok(!/stays readable at thumbnail size/.test(text));
  assert.ok(!/gets hard to read at thumbnail size/.test(text),
    'a warning was raised from the model rather than from the measurement');
});

test('the positive claim also needs the cohort to share it', () => {
  /* A measured pass is permission, not an instruction. */
  const mixed = cohort.map((row, index) =>
    index < 10 ? { ...row, thumbnailReadability: 'hard', contrast: 'low' } : row);
  const text = said(compare({ ...design, mechanism: 'illustration' }, mixed,
    { measured: quality() }));
  assert.ok(!/stays readable at thumbnail size/.test(text));
  assert.ok(!/contrast matches/.test(text));
});

test('no readability sentence exists that no measurement state can produce', () => {
  const states = [
    {}, { measured: quality() },
    { measured: quality({ thumbnailReadable: 'unverified', contrast: 'unverified' }) },
    { measured: quality({ mayClaimReadable: false, mayClaimHighContrast: false,
      contrast: 'fail', thumbnailReadable: 'fail' }) },
  ];
  const seen = new Set();
  for (const state of states)
    for (const line of said(compare(design, cohort, state)).split(' | '))
      if (/read|contrast/i.test(line)) seen.add(line.trim());
  assert.ok(seen.size >= 3,
    `only ${seen.size} distinct readability sentences are reachable: ${[...seen].join(' / ')}`);
});
