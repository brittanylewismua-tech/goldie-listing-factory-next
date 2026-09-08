import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterBatchHistory} from '../app/batch-history-filter.ts';

test('saved batches filter by batch, product, or bundle-member name',()=>{
 const rows=[{id:'1',display_name:'Holiday launch',product_title:'Two products',members:[{productName:'Gildan Tee'},{productName:'Mug 11oz'}]},{id:'2',display_name:'Spring',product_title:'Phone case'}];
 assert.deepEqual(filterBatchHistory(rows,'holiday').map(row=>row.id),['1']);
 assert.deepEqual(filterBatchHistory(rows,'mug').map(row=>row.id),['1']);
 assert.deepEqual(filterBatchHistory(rows,'PHONE').map(row=>row.id),['2']);
 assert.equal(filterBatchHistory(rows,'missing').length,0);
});

test('history search clears hidden selection and select-all is scoped to visible results',()=>{
 const page=readFileSync(new URL('../app/batches/page.tsx',import.meta.url),'utf8');
 assert.match(page,/onChange=\{event=>\{setQuery\(event\.target\.value\);setSelected\(\[\]\)\}\}/);
 assert.match(page,/visibleSelected\.length===visibleIds\.length/);
 assert.match(page,/No matching batches/);
});
