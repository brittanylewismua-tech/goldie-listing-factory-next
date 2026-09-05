import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('a bundle member never inherits another product’s Etsy category baseline',()=>{
  const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
  assert.match(source,/baseline=etsyBaselineProduct.current===templateDetails\?\.id\?etsyProductBaseline.current:null/);
  assert.match(source,/if\(!baseline\)\{etsyBaselineProduct.current=templateDetails\?\.id\|\|"";const physical/);
  // Execute the exact production selection expression across a tee -> hoodie -> mug sequence.
  const expression=source.match(/baseline=(etsyBaselineProduct.current===templateDetails\?\.id\?etsyProductBaseline.current:null)/)[1];
  const select=new Function('etsyBaselineProduct','templateDetails','etsyProductBaseline',`return ${expression}`);
  const tee={category:'T-shirts'},hoodie={category:'Sweatshirts'};
  assert.equal(select({current:'tee'},{id:'tee'},{current:tee}),tee);
  assert.equal(select({current:'tee'},{id:'hoodie'},{current:tee}),null);
  assert.equal(select({current:'hoodie'},{id:'mug'},{current:hoodie}),null);
  assert.equal(select({current:'hoodie'},{id:'hoodie'},{current:hoodie}),hoodie);
});
