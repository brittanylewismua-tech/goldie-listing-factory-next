import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {draftPriceEdits,updateDraftPriceEdits} from '../app/draft-price-edits.ts';

const fixture=()=>[
  {id:'front-back',costReview:{approved:false,variants:[{id:101,cost:1854,price:2400}]}},
  {id:'front-only',costReview:{approved:true,variants:[{id:101,cost:1238,price:2400}]}},
];
test('switching title listings remounts the preview instead of retaining the previous decoded image',()=>{
  const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
  assert.match(source,/button key=\{`\$\{design.id\}:\$\{shot\}`\} type="button" className="listing-product-preview"/);
});
test('same Printify variant ID can retain distinct front-only and front/back prices',()=>{
  const original=fixture();
  let drafts=updateDraftPriceEdits(original,new Set(['front-back']),{'101':3400});
  drafts=updateDraftPriceEdits(drafts,new Set(['front-only']),{'101':2700});
  assert.deepEqual(draftPriceEdits(drafts[0]),{'101':3400});
  assert.deepEqual(draftPriceEdits(drafts[1]),{'101':2700});
  assert.equal(original[0].priceEdits,undefined);
});
test('alternating cost-group calculations converge instead of overwriting each other forever',()=>{
  let drafts=fixture();
  for(let i=0;i<4;i++){
    const before=drafts;
    drafts=updateDraftPriceEdits(drafts,new Set(['front-back']),{'101':3400});
    drafts=updateDraftPriceEdits(drafts,new Set(['front-only']),{'101':2700});
    if(i>0)assert.equal(drafts,before);
  }
});
test('editing one group leaves the other group and its saved approval intact',()=>{
  const original=fixture();
  const drafts=updateDraftPriceEdits(original,new Set(['front-back']),{'101':3500});
  assert.equal(drafts[1],original[1]);
  assert.equal(drafts[1].costReview.approved,true);
  assert.equal(drafts[0].costReview.approved,false);
});
test('price edits survive the saved-draft JSON roundtrip and ignore unrelated variants',()=>{
  const drafts=updateDraftPriceEdits(fixture(),new Set(['front-back']),{'101':3500,'999':1});
  const restored=JSON.parse(JSON.stringify(drafts));
  assert.deepEqual(draftPriceEdits(restored[0]),{'101':3500});
  assert.deepEqual(draftPriceEdits(restored[1]),{'101':2400});
});
test('pricing cards read, edit, and save the same isolated group prices',()=>{
  const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
  const panel=source.slice(source.indexOf('if(task==="draft-pricing")'),source.indexOf('if(task==="draft-shipping"'));
  assert.match(panel,/groupPrices=draftPriceEdits\(group.drafts\[0\]\)/);
  assert.match(panel,/prices=\{groupPrices\}/);
  assert.match(panel,/updateDraftPriceEdits\(current,ids,value\)/);
  assert.match(panel,/approveActualPricingGroup\(group,groupPrices\)/);
  assert.doesNotMatch(panel,/setVariantPrices|prices=\{variantPrices\}|approved=pricingApproved&&/);
  assert.match(panel,/Prices for/);
  assert.match(panel,/preserveEdits=\{Boolean\(group.drafts\[0\].priceEdits\)\}/);
  assert.doesNotMatch(panel,/Prices saved to every listing/);
});
test('restored edits opt out of both automatic price initialization paths',()=>{
  const source=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
  assert.match(source,/if\(approved\|\|preserveEdits\|\|!selectedProfile/);
  assert.match(source,/const manualPriceEdit=useRef\(preserveEdits\)/);
  assert.match(source,/if\(!variants.length\|\|approved\|\|manualPriceEdit.current\)return/);
});
