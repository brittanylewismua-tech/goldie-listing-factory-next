import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../app/listing-factory-app.tsx', import.meta.url), 'utf8');

test('bundle title generation labels name the active product, matching its files-only handler', () => {
  assert.match(source, /activeBundle\?"Create titles for this product":"Create titles for the whole batch"/);
  assert.match(source, /activeBundle\?"Auto-create titles for this product":"Auto-create all titles"/);
  assert.match(source, /activeBundle\?"Uses your selections for this product":"Uses your selections across the batch"/);
  assert.match(source, /async function buildBatchTitle\(\)[\s\S]*?runBounded\(files,2/);
});

test('bundle description editing and reset do not claim to affect other products', () => {
  assert.match(source, /activeBundle\?"Description for this product’s listings":"Description for every listing"/);
  assert.match(source, /activeBundle\?"Applies to this product’s listings only\.":"Applies to every listing in this batch\."/);
  assert.match(source, /activeBundle\?"Use this product’s description again":"Use the batch description again"/);
});
