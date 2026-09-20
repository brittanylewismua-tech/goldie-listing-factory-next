import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
  WHAT THE PHONE AUDIT FOUND, GUARDED AT SOURCE.

  The real proof is tools/mobile-audit, which renders the shipping components
  in a headless browser at 375, 390 and 430 with a coarse pointer and measures
  contrast from rendered pixels. That needs a server and a browser, so it does
  not belong in this suite.

  These are the specific declarations that produced the failures. They are
  cheap, and each one names the measurement that justified it, so nobody has
  to rediscover why the value is what it is.
*/
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const luminance = ([r, g, b]) => {
  const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const onWhite = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return 1.05 / (luminance([r, g, b]) + 0.05);
};

test('shop map text does not fade itself out of legibility', () => {
  /*
    Ten rules here faded to between .6 and .85. Opacity multiplies against
    whatever is behind it, so the same declaration reads differently on every
    card — on the money card it put "This month" at 1.77:1 against a 4.5
    minimum. The muting lives in the colour now, where it can be checked.
  */
  const css = read('app/shop-map/shop-map.css');
  const faded = css.split('\n')
    .filter(line => /opacity:\s*0?\.\d/.test(line) && !/:disabled/.test(line)
      && !line.trim().startsWith('*') && !line.trim().startsWith('/*'));
  assert.deepEqual(faded, [],
    'text in shop-map.css is fading itself again:\n' + faded.join('\n'));
});

test('the muted text tokens are dark enough for the cards they sit on', () => {
  /*
    Each of these passed on pure white and failed on the tinted card it is
    actually used on. The margin below is deliberate: the surfaces are not
    white, so clearing 4.5 on white is not enough.
  */
  const tokens = [
    ['app/product-tokens.css', '--p-muted', 6.0],
    ['app/design-scanner/design-scanner.css', '--muted', 6.0],
  ];
  for (const [file, name, floor] of tokens) {
    const m = new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(read(file));
    assert.ok(m, `${name} not found in ${file}`);
    const ratio = onWhite(m[1]);
    assert.ok(ratio >= floor,
      `${name} is ${m[1]} — ${ratio.toFixed(2)}:1 on white, which leaves nothing `
      + `in hand for the tinted surfaces it is used on (want >= ${floor})`);
  }
});

test('the destructive account control is readable', () => {
  /* --p-muted measured 3.86:1 on this button, which deletes everything the
     member has. It uses the design system's darker text token now. */
  const css = read('app/account/settings/account.css');
  const rule = /\.acc-delete-open\{[^}]*\}/.exec(css);
  assert.ok(rule, '.acc-delete-open rule not found');
  assert.ok(!/color:var\(--p-muted\)/.test(rule[0]),
    'the delete control is back on the muted token that measured 3.86:1');
});

test('a 44px touch floor exists and is scoped to touch devices', () => {
  /*
    The niche input, both searches and the account links sat at 40-42px.
    Scoped to a coarse pointer so the approved desktop sizing is untouched.
  */
  const css = read('app/suite-redesign.css');
  const block = /@media \(pointer: coarse\)\s*\{[\s\S]*?\n\}/.exec(css);
  assert.ok(block, 'the coarse-pointer touch floor is gone');
  assert.match(block[0], /min-height:\s*44px/);
  for (const control of ['.p-input', '.acc-delete-open', '.acc-link'])
    assert.ok(block[0].includes(control), `${control} is not held to the touch floor`);
});

test('the phone gate, which is all a member sees on a small screen, is not faded', () => {
  const css = read('app/approved-functional.css');
  const rule = /\.mobile-card p\{[^}]*\}/.exec(css);
  assert.ok(rule, '.mobile-card p rule not found');
  assert.ok(!/rgba\(74,42,62,\.(7|75|8)\)/.test(rule[0]),
    'the desktop-required message is faded again');
});

test('the month label keeps the brand pink rather than a faded version of it', () => {
  /* The pink reads at 4.81:1 on its own; a .7 opacity took it to 3.41. The
     fix was removing the fade, not changing the colour. */
  const css = read('app/shop-map/shop-map.css');
  const rule = /\.shop-map-period\{[^}]*\}/.exec(css);
  assert.ok(rule, '.shop-map-period rule not found');
  assert.ok(!/opacity/.test(rule[0]), 'the month label is faded again');
});
