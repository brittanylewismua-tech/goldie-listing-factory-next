import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {RENAME_BATCH} from '../app/batch-display-name.ts';
test('saving a bundle name updates the parent and every owned child, not another batch or owner',()=>{
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE listing_batches(id TEXT,user_id TEXT,parent_batch_id TEXT,state_json TEXT,updated_at TEXT)');
  for(const [id,owner,parent] of [['run','me',null],['tee','me','run'],['hoodie','me','run'],['foreign','them','run'],['other','me',null]])db.prepare('INSERT INTO listing_batches VALUES (?,?,?,?,NULL)').run(id,owner,parent,JSON.stringify({drafts:[{id:'keep'}],batchDisplayName:'old'}));
  assert.deepEqual(db.prepare(RENAME_BATCH).all('Summer designs','me','tee').map(x=>x.id).sort(),['hoodie','run','tee']);
  for(const id of ['run','tee','hoodie'])assert.deepEqual(JSON.parse(db.prepare('SELECT state_json FROM listing_batches WHERE id=?').get(id).state_json),{drafts:[{id:'keep'}],batchDisplayName:'Summer designs'});
  for(const id of ['foreign','other'])assert.equal(JSON.parse(db.prepare('SELECT state_json FROM listing_batches WHERE id=?').get(id).state_json).batchDisplayName,'old');
  assert.equal(db.prepare(RENAME_BATCH).all('bad','them','tee').length,0);db.close();
});
test('stale autosaves cannot erase an explicitly saved name',()=>{
  const source=readFileSync(new URL('../app/api/batches/route.ts',import.meta.url),'utf8');
  const expression=source.match(/state_json=(CASE WHEN length\(trim\(COALESCE\(json_extract\(listing_batches\.state_json,[\s\S]*?END),updated_at/)[1];
  const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE listing_batches(id TEXT PRIMARY KEY,state_json TEXT)');
  const save=db.prepare(`INSERT INTO listing_batches VALUES (?,?) ON CONFLICT(id) DO UPDATE SET state_json=${expression}`);
  save.run('a',JSON.stringify({batchDisplayName:'Summer',drafts:[1]}));save.run('a',JSON.stringify({batchDisplayName:'old',drafts:[1,2]}));
  assert.deepEqual(JSON.parse(db.prepare('SELECT state_json FROM listing_batches').get().state_json),{batchDisplayName:'Summer',drafts:[1,2]});db.close();
});
