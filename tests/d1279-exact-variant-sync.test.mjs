import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('completed Etsy drafts expose a direct saved-change action instead of a dead-end warning',()=>{
 const handoff=read('app/photo-delivery-handoff.tsx'),copy=read('app/delivery-write.ts');
 assert.match(handoff,/Saved changes not applied/);
 assert.match(handoff,/Apply saved changes/);
 assert.match(handoff,/item\.status==='completed'&&item\.choicesChanged&&!item\.choiceCheckUnavailable/);
 assert.match(copy,/Apply them here before publishing/);
});

test('variant synchronization keeps an immutable per-listing baseline and may restore only real Etsy rows',()=>{
 const service=read('app/api/listing-photos/delivery/service.ts'),sync=read('app/api/listing-photos/delivery/draft-service.ts');
 assert.match(service,/inventory-baselines\/\$\{row\.etsy_shop_id\}\/\$\{listingId\}\/\$\{row\.product_id\}/);
 assert.match(service,/ORDER BY created_at ASC LIMIT 50/);
 assert.match(sync,/synchronizedInventory/);
 assert.match(sync,/if\(enabledLive\.some\(row=>!allBySku\.has\(row\.sku\)\)\)return null/);
 assert.doesNotMatch(sync,/publish\.json|state\s*:\s*['"]active/);
});
