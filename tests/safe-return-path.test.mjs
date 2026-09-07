import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
import {safeReturnPath} from '../app/safe-return-path.ts';
const unsafe=['https://example.com','//example.com','/\\example.com','/\t/example.com','/\n/example.com','/\r/example.com','\\\\example.com'];
test('auth return destinations stay local after browser URL normalization',()=>{
 for(const value of unsafe){const path=safeReturnPath(value);assert.equal(path,'/listing-factory',JSON.stringify(value));assert.equal(new URL(path,'https://www.thegoldiesuite.com').origin,'https://www.thegoldiesuite.com')}
 for(const path of ['/','/batches','/listing-factory?batch=existing&step=finish#photos','/goals?name=two words'])assert.equal(new URL(safeReturnPath(path),'https://www.thegoldiesuite.com').href,new URL(path,'https://www.thegoldiesuite.com').href);
});
function route(file,client){const raw=readFileSync(file,'utf8'),body=raw.slice(raw.indexOf('export async function GET')).replace('export async function','async function');return new Function('createSupabaseServerClient','NextResponse','safeReturnPath',ts.transpile(body,{target:ts.ScriptTarget.ES2022})+';return GET')(async()=>client,{redirect:url=>url},safeReturnPath)}
test('successful and failed callbacks never forward external return paths',async()=>{
 for(const success of [true,false])for(const value of unsafe){let exchanges=0;const get=route('app/auth/callback/route.ts',{auth:{exchangeCodeForSession:async()=>{exchanges++;return {error:success?null:{message:'expired'}}}}});const target=await get(new Request('https://www.thegoldiesuite.com/auth/callback?code=test&return_to='+encodeURIComponent(value)));assert.equal(exchanges,1);assert.equal(target.origin,'https://www.thegoldiesuite.com');assert.equal(success?target.pathname:target.searchParams.get('return_to'),'/listing-factory')}
});
test('sign-out keeps its original operation and normalizes the return destination',async()=>{
 for(const value of ['/batches',...unsafe]){let signsOut=0;const get=route('app/account/sign-out/route.ts',{auth:{signOut:async()=>{signsOut++}}});const target=await get(new Request('https://www.thegoldiesuite.com/account/sign-out?return_to='+encodeURIComponent(value)));assert.equal(signsOut,1);assert.equal(target.origin,'https://www.thegoldiesuite.com');assert.equal(target.pathname,value==='/batches'?'/batches':'/listing-factory')}
});
