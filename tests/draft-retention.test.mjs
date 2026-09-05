import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {DELETE_UNUSED_TEMPLATE_SESSIONS} from '../app/api/printify/retention.ts';
test('expired sessions referenced by created or pending drafts survive routine catalog cleanup',()=>{
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE printify_batch_sessions(id TEXT,user_id TEXT,expires_at INTEGER); CREATE TABLE printify_draft_results(batch_id TEXT,user_id TEXT,status TEXT,updated_at TEXT)');
  for(const [id,status] of [['created','succeeded'],['pending','running'],['uncertain','uncertain'],['failed','failed']]){
    db.prepare('INSERT INTO printify_batch_sessions VALUES (?,?,0)').run(id,'owner');
    db.prepare('INSERT INTO printify_draft_results VALUES (?,?,?,?)').run(id,'owner',status,'2025-01-01');
  }
  db.exec("INSERT INTO printify_batch_sessions VALUES ('unused','owner',0),('not-the-owner','owner',0); INSERT INTO printify_draft_results VALUES ('not-the-owner','other','succeeded','2025-01-01')");
  db.prepare(DELETE_UNUSED_TEMPLATE_SESSIONS).run();
  assert.deepEqual(db.prepare('SELECT id FROM printify_batch_sessions ORDER BY id').all().map(x=>x.id),['created','failed','pending','uncertain']);
  assert.equal(db.prepare('SELECT count(*) AS n FROM printify_draft_results').get().n,5);
  db.close();
});
test('catalog refresh never ages out the ownership records for saved Printify drafts',()=>{
  const source=readFileSync(new URL('../app/api/printify/route.ts',import.meta.url),'utf8');
  assert.doesNotMatch(source,/DELETE FROM printify_draft_results/);
  assert.match(source,/db\.prepare\(DELETE_UNUSED_TEMPLATE_SESSIONS\)/);
  const creation=readFileSync(new URL('../app/api/printify/drafts/route.ts',import.meta.url),'utf8');
  assert.match(creation,/sourceTemplateId:session\.product_id/);
});
