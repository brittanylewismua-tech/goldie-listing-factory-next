import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectedPriceGroup} from '../app/draft-price-navigation.ts';

test('large batches expose exactly one selected pricing group at a time',()=>{
 const groups=Array.from({length:20},(_,index)=>({key:`group-${index+1}`}));
 assert.deepEqual(selectedPriceGroup(groups,''),{group:groups[0],index:0});
 assert.deepEqual(selectedPriceGroup(groups,'group-20'),{group:groups[19],index:19});
 assert.deepEqual(selectedPriceGroup(groups,'removed-group'),{group:groups[0],index:0});
 const page=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
 assert.match(page,/Pricing group \{selected\.index\+1\} of \{groups\.length\}/);
 assert.doesNotMatch(page,/groups\.map\(group=>\{const approved=/);
});

test('delivery errors are shown once when the immediate and saved messages match',()=>{
 const page=readFileSync(new URL('../app/photo-delivery-handoff.tsx',import.meta.url),'utf8');
 assert.match(page,/new Set\(\[item\?\.error\?\.trim\(\),problem\?\.trim\(\)\]/);
 assert.doesNotMatch(page,/\{item\?\.error&&<small role="alert">/);
});

test('Etsy taxonomy copy says what Goldie actually sends',()=>{
 const page=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
 assert.match(page,/This category and these attributes are added to your Etsy draft/);
 assert.doesNotMatch(page,/Saved here as your reference for Etsy/);
});
