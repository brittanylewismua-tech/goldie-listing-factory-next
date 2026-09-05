import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
test('editing a successful draft in another month never consumes another creation',()=>{
  const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE printify_draft_results(request_key TEXT PRIMARY KEY,user_id TEXT,status TEXT,updated_at TEXT)');
  db.exec("INSERT INTO printify_draft_results VALUES ('old','owner','succeeded','2026-08-15 12:00:00'),('new','owner','running','2026-09-05 12:00:00')");
  db.exec(readFileSync(new URL('../drizzle/0021_draft_creation_receipts.sql',import.meta.url),'utf8'));
  db.exec("UPDATE printify_draft_results SET updated_at='2026-09-05 14:00:00' WHERE request_key='old'");
  assert.equal(db.prepare("SELECT created_at FROM printify_draft_results WHERE request_key='old'").get().created_at,'2026-08-15 12:00:00');
  db.exec("UPDATE printify_draft_results SET status='succeeded' WHERE request_key='new'");
  const receipt=db.prepare("SELECT created_at FROM printify_draft_results WHERE request_key='new'").get().created_at;assert.ok(receipt);
  db.exec("UPDATE printify_draft_results SET updated_at='2030-01-01',status='succeeded' WHERE request_key='new'");
  assert.equal(db.prepare("SELECT created_at FROM printify_draft_results WHERE request_key='new'").get().created_at,receipt);
  db.close();
});
