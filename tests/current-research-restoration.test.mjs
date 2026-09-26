import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const read=p=>readFileSync(new URL('../app/'+p,import.meta.url),'utf8');
test('simultaneous requests cannot create duplicate research for the same keyword',()=>{
 const source=read('api/niche-research/route.ts'),sql=source.match(/db.prepare\(`(INSERT INTO niche_research_projects[\s\S]*?RETURNING id)`\)/)[1];
 const db=new DatabaseSync(':memory:');try{db.exec('CREATE TABLE niche_research_projects(id TEXT,user_id TEXT,payload TEXT,owner_identity TEXT,updated_at INTEGER,next_run INTEGER)');
 const insert=(id,user,name)=>db.prepare(sql).get(id,user,JSON.stringify({name}), '{}',100,100,user,user,name);
 assert.equal(insert('a','one','Bachelorette').id,'a');assert.equal(insert('b','one','bachelorette'),undefined);assert.equal(insert('c','two','bachelorette').id,'c');
 for(let i=1;i<10;i++)assert.ok(insert('n'+i,'one','niche '+i));assert.equal(insert('over','one','eleventh'),undefined);
 }finally{db.close()}
});
test('Watchlist primary action opens the approved Research workspace',()=>{
 const ui=read('market-watch/market-watch-client.tsx');assert.match(ui,/openResearch\(watch.phrase\)/);assert.match(ui,/Open research →/);assert.match(ui,/researchOnly:true/);
 assert.doesNotMatch(ui,/Favorites per day listed|First listed most recently|Saved comparisons|Review dates show when feedback was posted/);
 const research=read('market-watch/research/research-client.tsx');assert.match(research,/brief:'Overview',shops:'Shops',listings:'Listings',buyers:'Buyer insights'/);assert.match(research,/role="dialog"/);assert.match(research,/See the products →/);
});
test('new keywords remain at the top independent of later refreshes',()=>{assert.match(read('niche-watch-store.ts'),/ORDER BY added_at DESC/);assert.match(read('api/niche-research/route.ts'),/ORDER BY CAST\(json_extract\(payload, '\$\.createdAt'\) AS INTEGER\) DESC/)});
