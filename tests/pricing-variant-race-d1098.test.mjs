import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('D1098: variant debounce is pending immediately and prevents price approval',()=>{
  const app=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
  const save=app.slice(app.indexOf('function syncDraftVariantChoices'),app.indexOf('async function updateDraftColorArtwork'));
  assert.ok(save.indexOf('setSavingDraftVariants(true)')<save.indexOf('window.setTimeout'));
  assert.match(app,/disabled=\{savingDraftVariants\|\|!verified\|\|Boolean\(pricingApprovalGroup\)\}/);
  assert.match(app,/if\(pricingApprovalGroup\|\|savingDraftVariants\)return/);
  assert.ok(app.includes('Saving product choices…'));
});
