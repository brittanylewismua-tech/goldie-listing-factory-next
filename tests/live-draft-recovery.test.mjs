import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initialDraftTitle} from '../app/initial-draft-title.ts';
const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');

test('uppercase upload names produce acceptable temporary titles without changing seller copy',()=>{
 assert.equal(initialDraftTitle(undefined,'GOLDIE_TEST_DRAFT_ONLY.png'),'Goldie test draft only');
 assert.equal(initialDraftTitle(undefined,'Western_Lioness.png'),'Western Lioness');
 assert.equal(initialDraftTitle('My EXACT seller title','ART.PNG'),'My EXACT seller title');
 assert.equal(initialDraftTitle(undefined,'.png'),'Untitled design');
 assert.equal(initialDraftTitle(undefined,'x'.repeat(300)+'.png').length,255);
});

test('a failed queued job is visible even when no draft completed',()=>{
 const start=source.indexOf('!running && !complete && drafts.some');
 assert.ok(start>=0);
 const panel=source.slice(start,source.indexOf('</section>',start));
 assert.match(panel,/role="alert"/);
 assert.match(panel,/draft\.error/);
 assert.match(panel,/onClick=\{retryFailed\}/);
 assert.match(source,/status:running\?"processing":drafts.some\(draft=>draft.status!=="Created"\)\?"needs_attention"/);
});

test('explicit retry reuses the same identity and only releases confirmed failures',()=>{
 const start=source.indexOf('async function recoverDraft');
 const loop=source.slice(start,source.indexOf('type DraftPreparation',start));
 assert.match(loop,/retryConfirmedFailure = false/);
 assert.match(loop,/if\(result.status==="failed"\)\{[\s\S]*?if\(retryConfirmedFailure\)return null/);
 assert.match(loop,/if\(result.status==="uncertain"\)throw/);
 assert.match(loop,/if\(result.status==="connection_missing"\)throw/);
 assert.match(source,/recoverDraft\(queuedSession,design.id,reportProgress,true\)/);
 assert.match(source,/const failedIds = new Set\(drafts.filter\(\(draft\) => draft.status !== "Created"\)/);
});

test('sorting and pagination hydrate only missing visible listing photos',()=>{
 const client=readFileSync(new URL('../app/market-watch/market-watch-client.tsx',import.meta.url),'utf8');
 const route=readFileSync(new URL('../app/api/market-watch/listing-photos/route.ts',import.meta.url),'utf8');
 assert.match(client,/visibleRows=ranked.slice\(0,shown\)/);
 assert.match(client,/missingPhotoIds=visibleRows.filter/);
 assert.match(client,/\[missingPhotoIds,photoRetry,section\]/);
 assert.match(client,/controller.abort\(\)/);
 assert.match(client,/Retry photos/);
 assert.match(route,/requireFeatureApi\('marketWatch'\)/);
 assert.match(route,/ids.length>100/);
 assert.match(route,/listingDisplay\(ids,'search'\)/);
});
