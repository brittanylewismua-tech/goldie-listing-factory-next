import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {claimDraftJobSql,claimDraftGroupSql} from '../app/api/printify/draft-job-store.ts';
import {MASTERMIND_BETA_PLAN} from '../app/plan-limits.ts';
function accessModule(active,redeemed){
 /* D1722 · isOwner moved into its own module so it could be tested without
    the Cloudflare runtime, so access.ts now re-exports it — which transpiles
    to a require() this sandbox does not have. The stub supplies it. */
 const source=readFileSync('app/mastermind/access.ts','utf8').replace(/^import .*;\n/gm,'');
 const ownerSource=readFileSync('app/owner-allowlist.ts','utf8').replace(/^import .*;\n/gm,'');
 const ownerExports={};
 new Function('exports',ts.transpile(ownerSource,{module:ts.ModuleKind.CommonJS}))(ownerExports);
 const require=()=>ownerExports;
 const env={DB:{prepare(sql){return {bind(){return this},async first(){return sql.includes('mastermind_settings')?{active}:redeemed?{redeemedAt:'2020-01-01 00:00:00'}:null}}}},MASTERMIND_ACCESS_CODE:'test-code'};
 /* access.ts also USES isOwner internally, and the import that binds it is
    stripped above, so it is supplied alongside require. */
 const exports={};
 new Function('env','exports','require','isOwner',
   ts.transpile(source,{module:ts.ModuleKind.CommonJS}))(env,exports,require,ownerExports.isOwner);
 return exports;
}
test('old beta redemptions stay valid until owner closes access; unredeemed users remain gated',async()=>{
 const user={email:'member@example.invalid',userId:'member'};
 assert.deepEqual(await accessModule(1,true).mastermindState(user),{active:true,enrollmentOpen:true,redeemed:true,expired:false,owner:false,expiresAt:null});
 assert.equal((await accessModule(0,true).mastermindState(user)).redeemed,false);
 assert.equal((await accessModule(1,false).mastermindState(user)).redeemed,false);
 assert.equal(await accessModule(1,true).codeMatches(' TEST-CODE '),true);
 assert.equal(await accessModule(1,true).codeMatches('wrong'),false);
});
function database(){const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE printify_draft_results(request_key TEXT PRIMARY KEY,user_id TEXT,batch_id TEXT,client_id TEXT,status TEXT,response_json TEXT,updated_at TEXT,created_at TEXT)');for(let i=0;i<9;i++)db.prepare("INSERT INTO printify_draft_results VALUES (?, 'member','batch',?,'succeeded','{}','2020-01-01','2020-01-01')").run('old'+i,'old'+i);return db;}
test('beta ten-listing lifetime quota includes earlier months and reserves the last slot atomically',()=>{
 assert.equal(MASTERMIND_BETA_PLAN.drafts,10);assert.equal(MASTERMIND_BETA_PLAN.aiMockups,undefined);
 const db=database(),claim=db.prepare(claimDraftJobSql('mastermind_beta'));
 assert.ok(claim.get('last','member','batch','last',10,'{}'));
 assert.equal(claim.get('eleventh','member','batch','eleventh',10,'{}'),undefined);
 assert.ok(db.prepare(claimDraftJobSql('goldie')).get('paid','member','batch','paid',10,'{}'),'paid monthly allowance remains monthly');db.close();
});
test('beta bundles reject whole groups exceeding lifetime allowance without partial admission',()=>{
 const db=database(),claim=db.prepare(claimDraftGroupSql('mastermind_beta'));
 const items=['a','b'].map(key=>({key,batchId:'batch',clientId:key,job:'{}'}));
 assert.deepEqual(claim.all(JSON.stringify(items),'member',10),[]);
 assert.equal(claim.all(JSON.stringify(items.slice(0,1)),'member',10).length,1);
 assert.equal(claim.all(JSON.stringify(items.slice(1)),'member',10).length,0);db.close();
});
