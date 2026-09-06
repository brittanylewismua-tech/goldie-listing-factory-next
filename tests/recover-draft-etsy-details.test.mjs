import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recoverDraftEtsyDetails} from '../app/recover-draft-etsy-details.ts';

test('returning to a product recovers preparation saved after switching away',()=>{
  const design={id:'hoodie-art',etsyError:'old error'};
  const details={category:'Hoodies',blurb:'Prepared hoodie description'};
  const restored=recoverDraftEtsyDetails(design,{clientId:'hoodie-art',etsyDetails:details});
  assert.equal(restored.etsy,details);
  assert.equal(restored.blurb,details.blurb);
  assert.equal(restored.etsyError,'');
  assert.equal(design.etsy,undefined);
});
test('never imports another product design details',()=>{
  const design={id:'tee-art'};
  assert.equal(recoverDraftEtsyDetails(design,{clientId:'hoodie-art',etsyDetails:{category:'Hoodies'}}),design);
});
test('existing seller edits and intentionally disabled personalization win',()=>{
  const design={id:'tee-art',etsy:{category:'T-shirts',personalization:{enabled:false}}};
  assert.equal(recoverDraftEtsyDetails(design,{clientId:'tee-art',etsyDetails:{category:'Hoodies',personalization:{enabled:true}}}),design);
});
test('missing server details are a no-op and an existing description is preserved',()=>{
  const design={id:'tee-art',blurb:'Seller description'};
  assert.equal(recoverDraftEtsyDetails(design),design);
  assert.equal(recoverDraftEtsyDetails(design,{clientId:'tee-art',etsyDetails:null}),design);
  assert.equal(recoverDraftEtsyDetails(design,{clientId:'tee-art',etsyDetails:{blurb:'Generated'}}).blurb,'Seller description');
});
test('live restore uses the exact matching saved draft before applying product facts',()=>{
  const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
  assert.match(source,/restoreAuthoritativeProductFacts\(recoverDraftEtsyDetails\([\s\S]*?as DesignFile,draft\)/);
});
