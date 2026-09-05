import test from 'node:test';
import assert from 'node:assert/strict';
import {bundleMemberDesigns} from '../app/bundle-member-designs.ts';

test('member exclusions are applied before cloning and never reappear in approvals',()=>{
  const files=[{id:'a'},{id:'b'}], cloned=[];
  const result=bundleMemberDesigns(files,'tee',{'tee:a':'exclude','tee:b':'include','hoodie:b':'include'},file=>{cloned.push(file.id);return {...file,id:'child-'+file.id};});
  assert.deepEqual(cloned,['b']);
  assert.deepEqual(result.designs,[{id:'child-b'}]);
  assert.deepEqual(result.decisions,{'tee:child-b':'include','hoodie:child-b':'include'});
  assert.deepEqual(files,[{id:'a'},{id:'b'}]);
});
test('different products keep their own included designs and stable active identities',()=>{
  const files=[{id:'a'},{id:'b'}], decisions={'tee:a':'exclude','tee:b':'include','hoodie:a':'include','hoodie:b':'exclude'};
  const tee=bundleMemberDesigns(files,'tee',decisions,file=>file);
  const hoodie=bundleMemberDesigns(files,'hoodie',decisions,file=>({...file,id:'h-'+file.id}));
  assert.equal(tee.designs[0],files[1]);
  assert.deepEqual(hoodie.designs,[{id:'h-a'}]);
  assert.equal(hoodie.decisions['hoodie:h-a'],'include');
  assert.equal(hoodie.decisions['hoodie:a'],undefined);
});
test('unrelated or suffix-similar stale approval keys are not copied',()=>{
  const result=bundleMemberDesigns([{id:'a'}],'tee',{'tee:aa':'exclude','tee:old':'include'},file=>file);
  assert.deepEqual(result.decisions,{});
  assert.equal(result.designs.length,1);
});
