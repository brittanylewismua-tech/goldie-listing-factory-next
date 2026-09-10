import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app/listing-factory-app.tsx','utf8');
const cleanup=fs.readFileSync('app/api/launch-check/listing.ts','utf8');
const route=fs.readFileSync('app/api/launch-check/route.ts','utf8');
const css=fs.readFileSync('app/interface-v2.css','utf8');

test('resumed creation retains the admitted total, completed baseline, and leave-safe copy',()=>{
  assert.match(app,/const restoredCreated=alreadyAdmitted\?drafts\.filter/);
  assert.match(app,/const admittedTotal=alreadyAdmitted\?files\.length:targetFiles\.length/);
  assert.match(app,/setProcessed\(restoredCreated\)/);
  assert.match(app,/restoredCreated\+completedDesignIds\.size/);
  assert.match(app,/You can leave this page and check Batch History anytime/);
});

test('deep links and product switches retain the exact listing and editor section',()=>{
  assert.match(app,/requestedChild=inspected\.find/);
  assert.match(app,/if\(focusedDraft\)setFinishPhase\("details"\)/);
  assert.match(app,/\["artwork","variants","pricing","photos"\]\.includes\(focusedSection\)\?"designs":"finish"/);
  assert.match(app,/nextUrl\.searchParams\.set\("listing",incoming\.clientId\)/);
  assert.match(app,/url\.searchParams\.delete\("listing"\)/);
  assert.match(app,/className="review-listing-switcher" aria-label="Choose a listing"/);
  assert.match(app,/candidateDraft\?\.previewUrl\|\|candidate\.previewUrl/);
  assert.match(app,/aria-current=\{selected\?"page":undefined\}/);
  assert.match(app,/open\(\(current\|\|reviewEditing\.section\|\|"title"\) as ReviewSection/);
  assert.match(css,/\.review-listing-switcher/);
  assert.match(css,/\.step-product-card:has\(>\.review-listing-editor-nav\)/);
});

test('owner cleanup remains exact, preflighted, unpublished-only, and continues Printify cleanup after Etsy refusal',()=>{
  assert.match(route,/body\.action==="cleanup-qa"/);
  assert.match(cleanup,/batchIds\.length<1\|\|batchIds\.length>8/);
  assert.match(cleanup,/WHERE user_id=\? AND batch_id IN/);
  assert.match(cleanup,/\^QA \(\?:CAPACITY\|E2E\)/);
  assert.match(cleanup,/product\.external\?\.id/);
  assert.match(cleanup,/listing\.state!==['"]draft['"]/);
  const etsyDelete=cleanup.indexOf("method:'DELETE',headers:etsyHeaders");
  const printifyDelete=cleanup.indexOf("method:'DELETE',headers,signal");
  assert.ok(etsyDelete>0&&printifyDelete>etsyDelete);
  assert.match(cleanup,/catch\(error\)\{pendingEtsy\.push/);
  assert.match(cleanup,/deletedPrintify,alreadyMissingPrintify,deletedEtsy,pendingEtsy,etsyDeleteError/);
});
