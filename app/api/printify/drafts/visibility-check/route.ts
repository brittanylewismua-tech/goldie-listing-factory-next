import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {decryptPrintifyToken} from '../../token-crypto';
import {checkHiddenSetting} from './engine';
const productId='6a9c8aad7a375e2c1704b171';
async function run(request:Request,write:boolean){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Sign in required.'},{status:401});
 if(Date.now()>Date.parse('2026-09-09T00:00:00Z'))return Response.json({error:'QA check expired.'},{status:410});
 if(write&&request.headers.get('Origin')!==new URL(request.url).origin)return Response.json({error:'Same-origin check required.'},{status:403});
 const owned=await env.DB.prepare("SELECT json_extract(response_json,'$.shopId') shop FROM printify_draft_results WHERE user_id=? AND status='succeeded' AND json_extract(response_json,'$.id')=? LIMIT 1").bind(user.userId,productId).first<{shop:number}>();
 if(!owned||Number(owned.shop)!==1374648)return Response.json({error:'Owned QA product required.'},{status:403});
 const runtime=env as unknown as {PRINTIFY_TOKEN_KEY:string;ARTWORK:{put(key:string,value:string):Promise<unknown>}};
 const connection=await env.DB.prepare('SELECT encrypted_token FROM printify_connections WHERE user_id=?').bind(user.userId).first<{encrypted_token:string}>();
 if(!connection)return Response.json({error:'Printify connection missing.'},{status:409});
 try{
 const token=await decryptPrintifyToken(connection.encrypted_token,runtime.PRINTIFY_TOKEN_KEY),url=`https://api.printify.com/v1/shops/${owned.shop}/products/${productId}.json`,headers={Authorization:`Bearer ${token}`,'User-Agent':'Goldie-Listing-Factory','Content-Type':'application/json'};
 const result=await checkHiddenSetting({read:async()=>{const r=await fetch(url,{headers,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`Printify read ${r.status}`);return r.json()},hide:async()=>{const r=await fetch(url,{method:'PUT',headers,body:JSON.stringify({visible:false}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`Printify hidden-setting update ${r.status}`)},backup:async p=>{await runtime.ARTWORK.put(`qa-draft-visibility/${user.userId}/${productId}/${Date.now()}.json`,JSON.stringify(p))}},write);
 const safe=JSON.stringify(result,null,2).replace(/&/g,'&amp;').replace(/</g,'&lt;');
 return new Response(`<html><head><title>Goldie QA draft connection check</title></head><body><h1>Existing QA draft connection check</h1><pre>${safe}</pre>${write?'':'<form method="post"><button type="submit">Test hidden setting only — no publishing</button></form>'}</body></html>`,{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'"}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'QA check failed. No publishing was attempted.'},{status:409})}
}
export const GET=(request:Request)=>run(request,false);
export const POST=(request:Request)=>run(request,true);
