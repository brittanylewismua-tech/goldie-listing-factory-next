import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../app/listing-factory-app.tsx', import.meta.url), 'utf8');

test('bundle title generation labels name the active product, matching its files-only handler', () => {
  assert.match(source, /activeBundle\?"Create titles and tags for this product":"Create all titles and tags"/);
  assert.match(source, /<h3>Create titles and tags<\/h3>/);
  assert.match(source, /async function buildBatchTitle\(\)[\s\S]*?runBounded\(files,2/);
});

test('bundle description editing and reset do not claim to affect other products', () => {
  assert.match(source, /activeBundle\?"Description for this product’s listings":"Description for every listing"/);
  assert.match(source, /descriptionLead\(collapsed=false\)/);
  assert.match(source, /activeBundle\?"Use this product’s description again":"Use the batch description again"/);
});
