import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const client=readFileSync(new URL('../app/account/sign-in/sign-in-client.tsx',import.meta.url),'utf8');
const body=client.slice(client.indexOf('  async function emailSignIn'),client.indexOf('  return <main'));
const factory=new Function('env',`with(env){${ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText};return {emailSignIn,googleSignIn};}`);
function harness(auth){
  const state={busy:null,error:'',message:''};
  const env={pending:{current:false},email:' person@example.com ',callback:()=>'/auth/callback',createSupabaseBrowserClient:()=>({auth}),setBusy:v=>state.busy=v,setError:v=>state.error=v,setMessage:v=>state.message=v};
  return {...factory(env),state,env};
}
const event={preventDefault(){}};
for(const method of ['email','google']){
  test(`${method} connection failure clears busy state and allows retry`,async()=>{
    let calls=0;
    const request=async()=>{calls++;if(calls===1)throw new Error('offline');return {error:null};};
    const h=harness({signInWithOtp:request,signInWithOAuth:request});
    const run=()=>method==='email'?h.emailSignIn(event):h.googleSignIn();
    await run();assert.equal(h.state.busy,null);assert.match(h.state.error,/Check your connection and try again/);assert.equal(h.env.pending.current,false);
    await run();assert.equal(calls,2);assert.equal(h.state.error,'');if(method==='email')assert.match(h.state.message,/Check your email/);
  });
}
test('rapid repeated submissions send only one email request',async()=>{
  let finish,calls=0,input;
  const h=harness({signInWithOtp:args=>{calls++;input=args;return new Promise(r=>finish=r);}});
  const work=h.emailSignIn(event);await h.emailSignIn(event);await h.googleSignIn();assert.equal(calls,1);assert.equal(input.email,'person@example.com');
  finish({error:{message:'Too many requests. Try again shortly.'}});await work;assert.match(h.state.error,/Too many/);assert.equal(h.state.busy,null);
});
const callbackSource=readFileSync(new URL('../app/auth/callback/route.ts',import.meta.url),'utf8');
const callbackBody=callbackSource.slice(callbackSource.indexOf('export async function GET')).replace('export async function','async function');
const makeCallback=new Function('createSupabaseServerClient','NextResponse',`${ts.transpileModule(callbackBody,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText};return GET;`);
for(const outcome of ['throw','error','success','missing']){
  test(`callback ${outcome} returns a usable destination`,async()=>{
    const get=makeCallback(async()=>({auth:{exchangeCodeForSession:async()=>{if(outcome==='throw')throw Error('offline');return {error:outcome==='error'?{message:'expired'}:null};}}}),{redirect:url=>url});
    const url=await get(new Request(`https://www.thegoldiesuite.com/auth/callback?return_to=%2Fbatches${outcome==='missing'?'':'&code=test'}`));
    assert.equal(url.pathname,outcome==='success'?'/batches':'/account/sign-in');
    if(outcome!=='success'){assert.equal(url.searchParams.get('error'),'signin');assert.equal(url.searchParams.get('return_to'),'/batches');}
  });
}
test('sign-in page passes an expired-link explanation to the rendered client',()=>{
  const page=readFileSync(new URL('../app/account/sign-in/page.tsx',import.meta.url),'utf8');
  assert.match(page,/initialError=\{query.error \? "Your sign-in link may have expired/);
  assert.match(client,/useState\(initialError\)/);
});
