import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
const body=app.slice(app.indexOf('function syncDraftVariantChoices'),app.indexOf('async function updateDraftColorArtwork'));
test('clear all cancels queued color saves and invalidates in-flight responses',()=>{
  assert.ok(body.indexOf('++variantSaveRevision.current')<body.indexOf('if(!selectedVariants.length)'));
  assert.ok(body.indexOf('clearTimeout(variantSaveTimer.current)')<body.indexOf('if(!selectedVariants.length)'));
  assert.match(body,/if\(!selectedVariants.length\)\{setSavingDraftVariants\(false\)/);
  const afterSave=body.slice(body.indexOf('return saved;'));
  assert.ok(afterSave.indexOf('if(revision!==variantSaveRevision.current)return')<afterSave.indexOf('setDrafts('));
});
test('alternate upload streams through signed delivery after owner verification',()=>{
  const route=readFileSync(new URL('../app/api/printify/drafts/update/route.ts',import.meta.url),'utf8');
  assert.ok(route.indexOf('staged.customMetadata?.owner!==user.userId')<route.indexOf('url:await signedArtworkUrl'));
  assert.doesNotMatch(route,/contents:await artworkContents/);
});
test('cancelling the file chooser and resetting artwork release its color lock',()=>{
  assert.match(app,/onCancel=\{\(\)=>\{artworkUploadColor.current=null\}\}/);
  assert.match(app,/onArtworkChange\(draft,focused,null,true\);artworkUploadColor.current=null/);
});
