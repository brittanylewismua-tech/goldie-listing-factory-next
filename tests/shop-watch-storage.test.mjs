import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../app/shop-watch-insight-store.ts',import.meta.url),'utf8').replace("'./shop-watch-insights'",JSON.stringify(new URL('../app/shop-watch-insights.ts',import.meta.url).href));
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {recordShopListings}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
function database(){const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE watched_shops(shop_id INTEGER PRIMARY KEY,added_at TEXT);');sql.prepare('INSERT INTO watched_shops VALUES(?,?)').run(1,new Date(100000).toISOString());const wrap=(query,args=[])=>({bind(...values){return wrap(query,values)},async first(){return sql.prepare(query).get(...args)??null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){return sql.prepare(query).run(...args)}});return {sql,prepare:wrap,async batch(statements){sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}};}
const listing=(over={})=>({listing_id:10,title:'Original shirt',price:{amount:2400,divisor:100,currency_code:'USD'},tags:['gift','shirt'],original_creation_timestamp:50,...over});
test('catalog persistence records actual edits once and preserves missing tags',async()=>{const db=database();try{
 await recordShopListings(db,1,[listing()],200);
 assert.equal(db.sql.prepare('SELECT count(*) AS n FROM shop_listing_changes').get().n,0);
 await recordShopListings(db,1,[listing({title:'Updated shirt',price:{amount:2200,divisor:100,currency_code:'USD'},tags:undefined})],300);
 assert.deepEqual(db.sql.prepare('SELECT kind FROM shop_listing_changes ORDER BY kind').all().map(r=>r.kind),['price','title']);
 await recordShopListings(db,1,[listing({title:'Updated shirt',price:{amount:2200,divisor:100,currency_code:'USD'},tags:['gift','shirt']})],400);
 assert.equal(db.sql.prepare('SELECT count(*) AS n FROM shop_listing_changes').get().n,2);
 await recordShopListings(db,1,[listing()],200);
 assert.equal(db.sql.prepare('SELECT checked_at FROM shop_listing_readings').get().checked_at,400);
 await recordShopListings(db,1,[listing({listing_id:11,original_creation_timestamp:450})],500);
 await recordShopListings(db,1,[listing({listing_id:11,original_creation_timestamp:450})],500);
 assert.equal(db.sql.prepare("SELECT count(*) AS n FROM shop_listing_changes WHERE kind='new'").get().n,1);
}finally{db.sql.close()}});
test('an unwatched shop never creates listing history',async()=>{const db=database();try{await recordShopListings(db,99,[listing()],500);assert.equal(db.sql.prepare('SELECT count(*) AS n FROM shop_listing_readings').get().n,0)}finally{db.sql.close()}});
