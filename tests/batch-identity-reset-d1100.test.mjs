import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('starting a fresh batch clears its prior name and saved-for-later status', () => {
  const source = readFileSync(new URL('../app/listing-factory-app.tsx', import.meta.url), 'utf8');
  const reset = source.slice(source.indexOf('function clearCurrentBatch('), source.indexOf('async function selectRecipe('));
  assert.match(reset, /setBatchDisplayName\(""\)/);
  assert.match(reset, /setKeptAsDrafts\(false\)/);
  assert.match(reset, /setBatchToolsOpen\(true\)/);
});
test('save and start new persists the name the seller entered', () => {
  const source = readFileSync(new URL('../app/listing-factory-app.tsx', import.meta.url), 'utf8');
  const save = source.slice(source.indexOf('async function saveAndRestart('), source.indexOf('function openDraft('));
  assert.match(save, /state:\{\.\.\.batchStateSnapshot\(\),batchDisplayName:name,keptAsDrafts:true\}/);
});
