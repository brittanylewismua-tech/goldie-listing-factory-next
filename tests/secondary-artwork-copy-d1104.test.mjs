import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('secondary artwork uses its print area rather than a junk filename', () => {
  const source = readFileSync(new URL('../app/listing-factory-app.tsx', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('{secondaryVersions.map('), source.indexOf('{secondaryVersions.map(') + 3000);
  assert.doesNotMatch(block, /<small>\{artwork.name\}<\/small>/);
  assert.match(block, /Remove \$\{printSideLabel\(artwork.side\).toLocaleLowerCase\(\)\} artwork/);
});
