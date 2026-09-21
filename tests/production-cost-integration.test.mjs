import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {monthOf,monthWindow} from '../app/finance-month.ts';
import * as costs from '../app/production-cost.ts';
import {rollUp} from '../app/finance-rollup.ts';
import {classifyLedgerType} from '../app/finance-classify.ts';
import {STALE_AFTER_SECONDS,REQUIRED_FINANCIAL_SOURCES} from '../app/finance-freshness.ts';

function database(){
 const sql=new DatabaseSync(':memory:');
 const source=readFileSync(new URL('../app/finance-store.ts',import.meta.url),'utf8');
 for(const m of source.matchAll(/`(CREATE TABLE IF NOT EXISTS finance_[\s\S]*?)`/g))sql.exec(m[1]);
 sql.exec('CREATE TABLE etsy_connections(user_id TEXT,shop_id INTEGER,is_active INTEGER); INSERT INTO etsy_connections VALUES (\'alice\',1,1),(\'bob\',2,1)');
 const prepare=(q,args=[])=>({bind:(...a)=>prepare(q,a),run:async()=>({meta:sql.prepare(q).run(...args)}),first:async()=>sql.prepare(q).get(...args)??null,all:async()=>({results:sql.prepare(q).all(...args)})});
 const db={sql,prepare,batch:async statements=>{sql.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};return db;
}
async function moduleAt(path,bindings){
 let source=readFileSync(new URL(path,import.meta.url),'utf8').replace(/^import[\s\S]*?;\n/gm,'');
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 const key=crypto.randomUUID();globalThis[key]=bindings;
 return import('data:text/javascript;base64,'+Buffer.from(`const {${Object.keys(bindings).join(',')}}=globalThis[${JSON.stringify(key)}];\n${compiled}`).toString('base64'));
}
function receipt(db,id,at,user='alice',shop=1){db.sql.prepare(`INSERT INTO finance_receipts(user_id,shop_id,receipt_id,subtotal_minor,shipping_minor,seller_discount_minor,currency,source_created_at,ingested_at) VALUES(?,?,?,2000,400,500,'USD',?,?)`).run(user,shop,id,at,at)}

test('real cost SQL uses exact month/shop and manual save is auditable and replaceable',async()=>{
 const db=database();
 const at=Date.parse('2026-09-10T12:00:00Z')/1000;
 receipt(db,1,at);receipt(db,2,Date.parse('2026-10-01T07:00:00Z')/1000);receipt(db,3,at,'bob',2);receipt(db,4,at,'alice',9);
 const mod=await moduleAt('../app/api/shop-map/production-cost/route.ts',{env:{DB:db},NextResponse:Response,withErrorLog:(_,fn)=>fn,requireFeatureApi:async()=>({ok:true,user:{userId:'alice'}}),crossSiteWrite:()=>false,CROSS_SITE_REFUSAL:{},ensureFinanceTables:async()=>{},shopTimezone:async()=> 'America/Los_Angeles',monthOf,monthWindow,...costs});
 const get=()=>mod.GET(new Request('https://example.test/api?month=2026-09')).then(r=>r.json());
 let body=await get();assert.deepEqual(body.orders.map(r=>r.receiptId),[1]);assert.equal(body.orders[0].revenueMinor,2400,'Etsy subtotal has already deducted discount');
 const save=(amount,id=1)=>mod.POST(new Request('https://example.test/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({receiptId:id,kind:'manual',amount,currency:'USD'})}));
 assert.equal((await save('-12')).status,400);assert.equal((await save('12.00',3)).status,404);assert.equal((await save('12.00')).status,200);
 body=await get();assert.equal(body.orders[0].productionCostMinor,1200);assert.equal(body.orders[0].costBasis,'manually-confirmed');
 assert.equal((await save('14.00')).status,200);body=await get();assert.equal(body.orders.length,1);assert.equal(body.orders[0].productionCostMinor,1400);
 assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM finance_adjustments WHERE reversed_by IS NULL').get().n,1);
 assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM finance_adjustments WHERE created_at > 0').get().n,2);
 db.sql.close();
});
test('a manual cost reduces monthly proceeds once and never adds to profit',async()=>{
 const db=database(),now=Math.floor(Date.now()/1000),month=monthOf(now,'UTC'),w=monthWindow(month,'UTC');
 receipt(db,1,now-60);
 db.sql.prepare(`INSERT INTO finance_adjustments(id,user_id,shop_id,month,receipt_id,kind,amount_minor,currency,estimated,created_at) VALUES('manual','alice',1,?,1,'manual-production-cost',1400,'USD',0,?)`).run(month,now);
 for(const source of [...REQUIRED_FINANCIAL_SOURCES,'receipts-complete'])db.sql.prepare(`INSERT OR REPLACE INTO finance_sources(user_id,shop_id,source,refreshed_at) VALUES('alice',1,?,?)`).run(source,now);
 db.sql.prepare(`INSERT INTO finance_windows(user_id,shop_id,window_from,window_to,state,updated_at) VALUES('alice',1,?,?,'complete',?)`).run(w.from,w.to,now);
 const mod=await moduleAt('../app/financial-month-read.ts',{env:{DB:db},STALE_AFTER_SECONDS,REQUIRED_FINANCIAL_SOURCES,rollUp,classifyLedgerType,monthWindow,ensureFinanceTables:async()=>{}});
 let result=await mod.readFinancialMonth('alice',1,month,'UTC');assert.equal(result.productionCostMinor,1400);assert.equal(result.adjustmentsMinor,0);assert.equal(result.manualCostCount,1);assert.equal(result.coverage.matchedReceipts,1);
 db.sql.prepare(`INSERT INTO finance_production(user_id,shop_id,printify_order_id,receipt_id,cost_minor,shipping_minor,currency,fulfilled_at,ingested_at) VALUES('alice',1,'actual',1,900,400,'USD',?,?)`).run(now,now);
 result=await mod.readFinancialMonth('alice',1,month,'UTC');assert.equal(result.productionCostMinor,900);assert.equal(result.productionShippingMinor,400);assert.equal(result.adjustmentsMinor,0);assert.equal(result.manualCostCount,0);
 db.sql.close();
});

test('saved action plans isolate accounts and enforce feature access on writes and reads',async()=>{
 const {PLAN_FEATURES,validPlan}=await import('../app/command-center-plan.ts');
 const db=database();let user='alice',allowed=true,cross=false;
 const mod=await moduleAt('../app/api/command-center/plans/route.ts',{env:{DB:db},NextResponse:Response,PLAN_FEATURES,validPlan,
   requireFeatureApi:async()=>allowed?{ok:true,user:{userId:user}}:{ok:false,response:Response.json({error:'denied'},{status:403})},crossSiteWrite:()=>cross,CROSS_SITE_REFUSAL:{error:'cross-site'}});
 const url='https://example.test/api?feature=marketWatch&source=test-keyword';
 const save=body=>mod.POST(new Request(url,{method:'POST',body:JSON.stringify(body)}));
 const values={title:'QA offer test',notes:'One experiment',outcome:'',status:'planned'};
 const created=await (await save(values)).json();assert.ok(created.plan.id);
 user='bob';assert.deepEqual((await (await mod.GET(new Request(url))).json()).plans,[]);
 assert.equal((await save({...values,id:created.plan.id})).status,404);
 user='alice';assert.equal((await save({...values,id:created.plan.id,status:'testing'})).status,200);
 const held=await (await mod.GET(new Request(url))).json();assert.equal(held.plans.length,1);assert.equal(held.plans[0].status,'testing');
 cross=true;assert.equal((await save(values)).status,403);cross=false;allowed=false;
 assert.equal((await mod.GET(new Request(url))).status,403);assert.equal((await save(values)).status,403);
 db.sql.close();
});

test('Printify offer checks only read owned products and preserve missing costs',async()=>{
 const db=database();db.sql.exec("CREATE TABLE printify_connections(user_id TEXT,encrypted_token TEXT); INSERT INTO printify_connections VALUES('alice','test')");
 const calls=[];const mod=await moduleAt('../app/api/command-center/product/route.ts',{env:{DB:db,PRINTIFY_TOKEN_KEY:'test'},NextResponse:Response,
 requireFeatureApi:async()=>({ok:true,user:{userId:'alice'}}),decryptPrintifyToken:async()=> 'test',cachedJson:async(_namespace,_path,_ttl,load)=>load(),
 printifyCall:async(url,options)=>{calls.push({url,method:options.method??'GET'});if(url.endsWith('/shops.json'))return Response.json([{id:10,title:'Example shop'},{id:11,title:'Other owned shop'}]);
 if(url.includes('/products/'))return Response.json({id:'abcdef123456abcdef123456',title:'Example shirt',blueprint_id:1,print_provider_id:2,variants:[{id:3,title:'S',cost:1200,price:2400,is_enabled:true},{id:4,title:'XL',price:2600,is_enabled:true},{id:5,title:'Not offered',cost:1600,price:2900,is_enabled:false}]});
 return Response.json({profiles:[{variant_ids:[3,4],countries:['US'],first_item:{cost:400,currency:'USD'}}]});}});
 const base='https://example.test/api?product=abcdef123456abcdef123456';
 let response=await mod.GET(new Request(base));assert.equal((await response.json()).shops.length,2);assert.equal(calls.length,1);
 response=await mod.GET(new Request(base+'&shop=99'));assert.equal(response.status,400);assert.ok(!calls.some(c=>c.url.includes('/shops/99/')));
 response=await mod.GET(new Request(base+'&shop=10'));const payload=await response.json();assert.equal(payload.variants.length,2);assert.equal(payload.variants[1].productionMinor,null);assert.equal(payload.shipping[0].first_item.currency,'USD');assert.ok(calls.every(c=>c.method==='GET'));
 assert.equal((await mod.GET(new Request('https://example.test/api?product=https://evil.test/secret'))).status,400);
 db.sql.close();
});
