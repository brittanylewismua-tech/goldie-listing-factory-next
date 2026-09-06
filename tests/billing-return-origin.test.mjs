import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const src=readFileSync(new URL('../app/billing.ts',import.meta.url),'utf8');
const code=ts.transpileModule(src.slice(src.indexOf('export function siteOrigin'),src.indexOf('export async function stripeRequest')).replace('export function','function'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const origin=new Function('billingRuntime',`${code};return siteOrigin;`)(()=>({GOLDIE_SITE_URL:'https://thegoldiesuite.com'}));
test('billing returns preserve the authenticated apex or www host',()=>{
  for(const host of ['thegoldiesuite.com','www.thegoldiesuite.com'])assert.equal(origin(new Request(`https://${host}/api/billing/portal`)),`https://${host}`);
});
test('unapproved origins and forwarded headers cannot redirect billing returns',()=>{
  for(const url of ['https://evil.test','https://thegoldiesuite.com.evil.test','http://www.thegoldiesuite.com','https://www.thegoldiesuite.com:8443'])assert.equal(origin(new Request(url,{headers:{'x-forwarded-host':'evil.test'}})),'https://thegoldiesuite.com');
  assert.equal(origin(),'https://thegoldiesuite.com');
});
