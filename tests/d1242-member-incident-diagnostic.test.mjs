import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route=fs.readFileSync(new URL('../app/api/mastermind/member-diagnostic/route.ts',import.meta.url),'utf8');
const page=fs.readFileSync(new URL('../app/mastermind-admin/member-audit/page.tsx',import.meta.url),'utf8');

test('D1242: owner support can resolve a mastermind member by name or email',()=>{
  assert.match(route,/export async function resolveMastermindMember/);
  assert.match(route,/terms\.every\(\(term\) => searchable\.includes\(term\)\)/);
  assert.match(route,/if \(!email && query\)/);
  assert.match(page,/query\?: string/);
  assert.match(page,/matches\.length === 1/);
});

test('D1242: member incident output summarizes jobs without returning private checkpoints',()=>{
  assert.match(route,/FROM printify_draft_results WHERE user_id=\?/);
  assert.match(route,/FROM listing_batches WHERE user_id=\?/);
  assert.match(route,/recentDiagnostics/);
  assert.match(route,/phase: typeof result\.phase/);
  assert.doesNotMatch(route,/inputKey:|workflowId:/);
});

test('D1245: owner diagnostics compare Louisa’s live Etsy and Printify variants without exposing SKUs',()=>{
  assert.match(route,/includeVariantAudit/);
  assert.match(route,/FROM photo_deliveries p WHERE p\.user_id=\?/);
  assert.match(route,/missingInEtsy/);
  assert.match(route,/extraInEtsy/);
  assert.match(route,/priceMismatches/);
  assert.match(route,/url\.searchParams\.get\("include"\)===\"variants\"/);
  assert.match(page,/auditMemberPrintify\(email,params\.include===\"variants\"\)/);
  assert.doesNotMatch(route,/missingSkus|extraSkus/);
});
