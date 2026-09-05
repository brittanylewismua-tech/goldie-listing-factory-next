import test from 'node:test';
import assert from 'node:assert/strict';
import {applyProductFacts} from '../app/etsy-product-facts.ts';
test('restored sleeve length updates its Etsy value ID as well as its visible label',()=>{
  const old={attributes:{'Sleeve length':'Short sleeve'},properties:[{label:'Sleeve length',value:'Long sleeve',valueId:1,possibleValues:[{value_id:1,name:'Short sleeve'},{value_id:2,name:'Long sleeve'}]}]};
  const result=applyProductFacts(old,{'Sleeve length':'Long sleeve'});
  assert.equal(result.properties[0].valueId,2);assert.equal(result.properties[0].value,'Long sleeve');assert.equal(old.properties[0].valueId,1);
});
test('category changes keep compatible known facts without inventing enum IDs or replacing unrelated fields',()=>{
  const properties=[{label:'Sleeve length',value:'Short sleeve',valueId:1,possibleValues:[{value_id:1,name:'Short sleeve'},{value_id:42,name:'Long sleeve'}]},{label:'Holiday',value:'Halloween',valueId:8,possibleValues:[{value_id:8,name:'Halloween'}]},{label:'Size',value:'M',valueId:9,possibleValues:[{value_id:9,name:'M'}]}];
  const result=applyProductFacts({attributes:{},properties},{'Sleeve length':'Long sleeve',Size:'Unisex'});
  assert.equal(result.properties[0].valueId,42);assert.deepEqual(result.properties.slice(1),properties.slice(1));
});
