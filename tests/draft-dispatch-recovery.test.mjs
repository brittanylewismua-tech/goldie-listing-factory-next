import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('a lost dispatch response recovers the same identity without replaying POST',()=>{
 const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
 const block=source.slice(source.indexOf('} catch (connectionError) {'),source.indexOf('const result = await response.json()',source.indexOf('} catch (connectionError) {')));
 assert.match(block,/recoverDraft\(requestDetails!\.batchId,design\.id\)/);
 assert.doesNotMatch(block,/fetchWithDeadline|method:\s*["']POST/);
});
test('a historical failed receipt cannot hide the new durable job',()=>{
 const source=readFileSync(new URL('../app/api/printify/drafts/route.ts',import.meta.url),'utf8');
 assert.match(source,/if\(legacy&&legacy.status!=="failed"\)return jobResponse/);
});
