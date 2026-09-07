import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
const waitProgress=readFileSync(new URL('../app/wait-progress.tsx',import.meta.url),'utf8');

test('routine color and size selection saves inline without opening the blocking wait dialog',()=>{
 const start=app.indexOf('<WaitProgress observeTools');
 const wait=app.slice(start,app.indexOf('/>',start));
 assert.doesNotMatch(wait,/savingDraftVariants\?\{title:/);
 assert.match(wait,/savingDraftArtwork\?\{title:"Updating color artwork"/);
 assert.match(app,/\{saving\?<span role="status">Saving choices…<\/span>:null\}/);
 assert.match(app,/draftVariantError&&<p className="field-error" role="alert">/);
});

test('color-specific artwork retains blocking progress and always clears it',()=>{
 const update=app.slice(app.indexOf('async function updateDraftColorArtwork'),app.indexOf('async function syncListingFields'));
 assert.match(update,/setSavingDraftVariants\(true\);setSavingDraftArtwork\(true\)/);
 assert.match(update,/finally\{setSavingDraftArtwork\(false\);setSavingDraftVariants\(false\)\}/);
});

test('routine saves and dedicated save dialogs do not summon a second global wait dialog',()=>{
 const start=app.indexOf('<WaitProgress observeTools');
 const wait=app.slice(start,app.indexOf('/>',start));
 assert.doesNotMatch(wait,/savingDraftBatch|restartingBatch|savingProductDefault/);
 assert.match(app,/savingDraftBatch\?"Saving batch…":"Save to Batch History"/);
 assert.match(app,/restartingBatch\?"Saving…":"Save batch \+ start new"/);
 assert.match(app,/savingProductDefault==="description"\?"Saving…"/);
 assert.match(waitProgress,/!node\.closest\('\[role="dialog"\],\[role="alertdialog"\]'\)/);
});
