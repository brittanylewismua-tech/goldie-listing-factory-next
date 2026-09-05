import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../app/bundle-keyword-bank.ts',import.meta.url),'utf8');
const {APPLY_BUNDLE_KEYWORD_BANK}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpile(source,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})).toString('base64'));
test('bundle bank changes persist for every owned child without touching designs, other runs, or another owner',()=>{
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE keyword_lists(id TEXT,user_id TEXT); CREATE TABLE listing_batches(id TEXT,user_id TEXT,parent_batch_id TEXT,state_json TEXT,updated_at TEXT);');
  db.prepare('INSERT INTO keyword_lists VALUES (?,?)').run('new-bank','owner');
  const state={autoTitleBankId:'old',activeRecipe:{id:'tee',keywordListId:'old'},bundleRecipes:[{id:'tee',keywordListId:'old'},{id:'hoodie',keywordListId:'other'}],designs:[{title:'Keep title',tags:['tag']}],drafts:[{id:'private-draft'}]};
  for(const [id,user,parent] of [['run','owner',null],['child','owner','run'],['different','owner',null],['foreign','other','run']])db.prepare('INSERT INTO listing_batches VALUES (?,?,?,?,NULL)').run(id,user,parent,JSON.stringify(state));
  const changed=db.prepare(APPLY_BUNDLE_KEYWORD_BANK).all('new-bank','owner','run').map(row=>row.id).sort();
  assert.deepEqual(changed,['child','run']);
  for(const id of changed){const saved=JSON.parse(db.prepare('SELECT state_json FROM listing_batches WHERE id=?').get(id).state_json);assert.equal(saved.autoTitleBankId,'new-bank');assert.equal(saved.manualKeywordBankId,'new-bank');assert.ok(saved.bundleRecipes.every(recipe=>recipe.keywordListId==='new-bank'));assert.deepEqual(saved.designs,state.designs);assert.deepEqual(saved.drafts,state.drafts);}
  for(const id of ['different','foreign'])assert.deepEqual(JSON.parse(db.prepare('SELECT state_json FROM listing_batches WHERE id=?').get(id).state_json),state);
  assert.equal(db.prepare(APPLY_BUNDLE_KEYWORD_BANK).all('new-bank','other','run').length,0);
  assert.equal(db.prepare(APPLY_BUNDLE_KEYWORD_BANK).all('missing','owner','run').length,0);
  db.close();
});
test('draft creation does not spend AI credits generating unrequested titles',()=>{
  const app=readFileSync(new URL('../app/listing-factory-app.tsx',import.meta.url),'utf8');
  const block=app.slice(app.indexOf('async function continueBundle('),app.indexOf('async function createCustomShippingProfile('));
  assert.doesNotMatch(block,/autoTitleForDesign|\/api\/keyword-lists/);
  const apply=app.slice(app.indexOf('async function applyBankToBundle('),app.indexOf('const bundleVariantCounts='));
  assert.doesNotMatch(apply,/\/api\/product-recipes/);
  assert.match(apply,/method:"PATCH"/);
  assert.match(apply,/if\(!response.ok\)throw/);
});
