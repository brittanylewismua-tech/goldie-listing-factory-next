import {env} from "cloudflare:workers";
import {NextResponse} from "next/server";
import {withErrorLog} from "@/app/error-log";
import {getChatGPTUser} from "@/app/chatgpt-auth";
import {customerLaunchBlock} from "@/app/customer-launch-gate";
import {isOwner} from "@/app/mastermind/access";
import {planFor} from "@/app/plan-limits";
import {unpackDraftMedia} from "@/app/draft-media-storage";
import {runBounded} from "@/app/bounded-work";
import {draftCreationKey} from "../draft-identity";
import {claimDraftJobSql,claimDraftGroupSql,pendingDraftJob,writeJobObject,jobObjectPrefix,type PendingDraftJob} from "../draft-job-store";
import type {DraftJobBindings,DraftJobInput,DraftRequestBody} from "./execute-job";
import {printifyVariantLimitMessage} from "@/app/printify-variant-limit";

type WorkflowBinding={create(options:{id:string;params:{key:string;owner:string}}):Promise<unknown>;createBatch(options:Array<{id:string;params:{key:string;owner:string}}>):Promise<unknown>;get(id:string):Promise<{status():Promise<unknown>}>};
type Bindings=DraftJobBindings&{DRAFT_CREATION:WorkflowBinding;ARTWORK:DraftJobBindings["ARTWORK"]&{put(key:string,value:ReadableStream|Uint8Array,options?:{customMetadata?:Record<string,string>;httpMetadata?:{contentType?:string}}):Promise<unknown>;delete(key:string):Promise<void>}};
const bindings=()=>env as unknown as Bindings;
type Row={status:string;response_json:string|null;updated_at:string;request_key:string};
type Session=DraftJobInput["session"];
async function legacyKey(batchId:string,clientId:string){const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`${batchId}:${clientId}`));return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,"0")).join("");}
async function lookup(key:string,owner:string){return bindings().DB.prepare("SELECT request_key,status,response_json,updated_at FROM printify_draft_results WHERE request_key=? AND user_id=?").bind(key,owner).first<Row>();}
async function startJob(key:string,owner:string,job:PendingDraftJob){
  // createBatch is idempotent: existing IDs are skipped. Normal polling no
  // longer makes a deliberately failing create followed by a status request.
  await bindings().DRAFT_CREATION.createBatch([{id:job.workflowId,params:{key,owner}}]);
}
async function jobResponse(row:Row,owner:string){
  if(row.status==="succeeded"&&row.response_json)return NextResponse.json({status:"succeeded",draft:await unpackDraftMedia(row.response_json,owner,bindings().ARTWORK)});
  const job=pendingDraftJob(row.response_json);
  if(job&&row.status!=="failed")await startJob(row.request_key,owner,job);
  // Older interrupted jobs have no durable identity. Do not silently call them
  // failed or allow a second product just because ninety seconds elapsed.
  return NextResponse.json({status:row.status,error:row.status==="failed"?job?.error:undefined,updatedAt:row.updated_at},{status:row.status==="failed"?200:202});
}
async function handleGET(request:Request){
  const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to continue."},{status:401});
  const url=new URL(request.url),batchId=url.searchParams.get("batchId")||"",clientId=url.searchParams.get("clientId")||"";
  if(!batchId||!clientId)return NextResponse.json({error:"Batch and design identifiers are required."},{status:400});
  const legacy=await lookup(await legacyKey(batchId,clientId),user.userId);
  if(legacy&&legacy.status!=="failed")return jobResponse(legacy,user.userId);
  const session=await bindings().DB.prepare("SELECT shop_id,product_id,template_json FROM printify_batch_sessions WHERE id=? AND user_id=?").bind(batchId,user.userId).first<Session>();
  if(!session)return NextResponse.json({status:"connection_missing",error:"The saved product connection could not be found."},{status:404});
  const key=await draftCreationKey(user.userId,session.shop_id,session.product_id,clientId),row=await lookup(key,user.userId);
  return row?jobResponse(row,user.userId):NextResponse.json({status:"not_found"},{status:404});
}
async function handlePOST(request:Request){
  const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in to continue."},{status:401});
  const blocked=await customerLaunchBlock(user);if(blocked)return NextResponse.json({error:blocked},{status:503});
  const runtime=bindings();
  if(!runtime.DB||!runtime.ARTWORK||!runtime.DRAFT_CREATION||!runtime.PRINTIFY_TOKEN_KEY)return NextResponse.json({error:"Secure draft processing is unavailable."},{status:503});
  const body=await request.json() as DraftRequestBody&{requests?:DraftRequestBody[]};
  if(body.requests)return handleGroupPOST(request,user,body.requests);
  const limitError=printifyVariantLimitMessage(new Set(body.selectedVariantIds||[]).size);
  if(limitError)return NextResponse.json({error:limitError},{status:400});
  if(!body.batchId||!body.clientId)return NextResponse.json({error:"The prepared batch and design identifiers are required."},{status:400});
  const legacy=await lookup(await legacyKey(body.batchId,body.clientId),user.userId);
  if(legacy?.status==="succeeded"||legacy?.status==="running"||legacy?.status==="uncertain")return jobResponse(legacy,user.userId);
  const session=await runtime.DB.prepare("SELECT shop_id,product_id,template_json FROM printify_batch_sessions WHERE id=? AND user_id=? AND expires_at>unixepoch()").bind(body.batchId,user.userId).first<Session>();
  if(!session)return NextResponse.json({error:"Reload the saved product to renew this batch connection."},{status:400});
  const key=await draftCreationKey(user.userId,session.shop_id,session.product_id,body.clientId);
  const prior=await lookup(key,user.userId);
  if(prior&&prior.status!=="failed")return jobResponse(prior,user.userId);
  const artworks=body.artworks?.length?body.artworks:body.fileName&&body.stagedId?[{key:"primary",fileName:body.fileName,stagedId:body.stagedId,bounds:body.visibleBounds,maxPlacementScale:body.maxPlacementScale}]:[];
  if(!artworks.length||artworks.length>40||new Set(artworks.map(a=>a.key)).size!==artworks.length)return NextResponse.json({error:"Each design needs a prepared artwork file."},{status:400});
  const workflowId=crypto.randomUUID(),copies:string[]=[];
  try{
    // Transfer ownership of the staged files to this durable job. The original
    // browser cache may be shared by another bundle member and is not deleted.
    for(let index=0;index<artworks.length;index++){
      const artwork=artworks[index],source=await runtime.ARTWORK.get(artwork.stagedId);
      if(!source?.body||source.customMetadata?.owner!==user.userId||Number(source.customMetadata?.expires||0)<=Date.now())throw Error("Upload this design again; its protected file is no longer available.");
      if(Number(source.customMetadata.expires)>Date.now()+8*60*60*1000){await source.body.cancel();continue;}
      const stagedId=jobObjectPrefix(user.userId,workflowId)+`artwork-${index}.bin`;
      await runtime.ARTWORK.put(stagedId,source.body,{customMetadata:{owner:user.userId,workflowId,expires:String(Date.now()+24*60*60*1000)},httpMetadata:{contentType:artwork.fileName.toLowerCase().endsWith(".png")?"image/png":"image/jpeg"}});
      copies.push(stagedId);artworks[index]={...artwork,stagedId};
    }
    const protectedBody:DraftRequestBody=body.artworks?.length?{...body,artworks}:{...body,stagedId:artworks[0].stagedId};
    const inputKey=await writeJobObject(runtime.ARTWORK,user.userId,workflowId,"input.json",{userId:user.userId,requestUrl:request.url,body:protectedBody,session} satisfies DraftJobInput);
    const job:PendingDraftJob={version:1,inputKey,workflowId,phase:"queued"};
    const planRow=await runtime.DB.prepare("SELECT plan_key FROM account_plans WHERE user_id=?").bind(user.userId).first<{plan_key:string}>();
    const plan=planFor(planRow?.plan_key,isOwner(user));
    const admitted=await runtime.DB.prepare(claimDraftJobSql(plan.key)).bind(key,user.userId,body.batchId,body.clientId,plan.drafts,JSON.stringify(job)).first();
    if(!admitted){
      await Promise.all([...copies,inputKey].map(id=>runtime.ARTWORK.delete(id)));
      const winner=await lookup(key,user.userId);
      if(winner&&winner.status!=="failed")return jobResponse(winner,user.userId);
      return NextResponse.json({error:`Your ${plan.name} plan's ${plan.drafts} draft allowance is already used or reserved by drafts in progress.`},{status:429});
    }
    // If dispatch loses its response, GET/POST can reattach using the same
    // persisted Workflow ID. Never release the reservation on that ambiguity.
    await startJob(key,user.userId,job);
    return NextResponse.json({status:"running"},{status:202});
  }catch(error){
    const active=await lookup(key,user.userId),job=pendingDraftJob(active?.response_json||null);
    if(job?.workflowId!==workflowId)await Promise.all(copies.map(id=>runtime.ARTWORK.delete(id).catch(()=>undefined)));
    return NextResponse.json({error:error instanceof Error?error.message:"Draft processing could not start.",status:job?.workflowId===workflowId?"running":undefined},{status:job?.workflowId===workflowId?202:400});
  }
}
async function handleGroupPOST(request:Request,user:NonNullable<Awaited<ReturnType<typeof getChatGPTUser>>>,requests:DraftRequestBody[]){
  if(!Array.isArray(requests)||!requests.length||requests.length>100)return NextResponse.json({error:"Choose between one and 100 draft requests."},{status:400});
  const runtime=bindings(),owner=user.userId;
  const prepared:Array<{key:string;batchId:string;clientId:string;job:PendingDraftJob;copies:string[]}>=[];
  const existing:Array<{key:string;job:PendingDraftJob}>=[];
  const seen=new Set<string>();
  const cleanup=async()=>{await runBounded(prepared,4,async item=>{const current=await lookup(item.key,owner);if(pendingDraftJob(current?.response_json||null)?.workflowId!==item.job.workflowId)await Promise.all([...item.copies,item.job.inputKey].map(key=>runtime.ARTWORK.delete(key).catch(()=>undefined)));return item;});};
  try{
    let preparationError:unknown;
    await runBounded(requests,4,async body=>{try{
      if(!body.batchId||!body.clientId)throw Error("Every draft needs its prepared product and design identifiers.");
      const limitError=printifyVariantLimitMessage(new Set(body.selectedVariantIds||[]).size);
      if(limitError)throw Error(limitError);
      const legacy=await lookup(await legacyKey(body.batchId,body.clientId),owner);
      if(legacy&&legacy.status!=="failed")throw Error("This older draft is already being tracked. Resume it before starting this submission.");
      const session=await runtime.DB.prepare("SELECT shop_id,product_id,template_json FROM printify_batch_sessions WHERE id=? AND user_id=? AND expires_at>unixepoch()").bind(body.batchId,owner).first<Session>();
      if(!session)throw Error("Reload the saved products to renew this batch connection.");
      const key=await draftCreationKey(owner,session.shop_id,session.product_id,body.clientId);
      if(seen.has(key))throw Error("The submission contains the same product and design twice.");seen.add(key);
      const prior=await lookup(key,owner);
      if(prior&&prior.status!=="failed"){
        const job=pendingDraftJob(prior.response_json);if(job)existing.push({key,job});return;
      }
      const artworks=body.artworks?.length?body.artworks:body.fileName&&body.stagedId?[{key:"primary",fileName:body.fileName,stagedId:body.stagedId,bounds:body.visibleBounds,maxPlacementScale:body.maxPlacementScale}]:[];
      if(!artworks.length||artworks.length>40||new Set(artworks.map(a=>a.key)).size!==artworks.length)throw Error("Each design needs a prepared artwork file.");
      const workflowId=crypto.randomUUID(),copies:string[]=[];
      const job:PendingDraftJob={version:1,workflowId,inputKey:jobObjectPrefix(owner,workflowId)+"input.json",phase:"queued"};
      prepared.push({key,batchId:body.batchId,clientId:body.clientId,job,copies});
      const protectedArtworks=[];
      for(let index=0;index<artworks.length;index++){
        const artwork=artworks[index],source=await runtime.ARTWORK.get(artwork.stagedId);
        if(!source?.body||source.customMetadata?.owner!==owner||Number(source.customMetadata?.expires||0)<=Date.now())throw Error("Upload this design again; its protected file is no longer available.");
        /* Fresh staging objects already survive for 24 hours. Copying every
           multi-draft upload into a second R2 object delayed admission by the
           full artwork transfer (45s in the measured two-draft run) before any
           Printify workflow could start. Reuse the owner-checked durable object
           while it has an eight-hour runway; only refresh an older object that
           may expire behind a long creation queue. */
        let stagedId=artwork.stagedId;
        if(Number(source.customMetadata.expires)<=Date.now()+8*60*60*1000){
          stagedId=jobObjectPrefix(owner,workflowId)+`artwork-${index}.bin`;
          copies.push(stagedId);
          await runtime.ARTWORK.put(stagedId,source.body,{customMetadata:{owner,workflowId,expires:String(Date.now()+24*60*60*1000)},httpMetadata:{contentType:artwork.fileName.toLowerCase().endsWith(".png")?"image/png":"image/jpeg"}});
        }else await source.body.cancel();
        protectedArtworks.push({...artwork,stagedId});
      }
      const protectedBody=body.artworks?.length?{...body,artworks:protectedArtworks}:{...body,stagedId:protectedArtworks[0].stagedId};
      await writeJobObject(runtime.ARTWORK,owner,workflowId,"input.json",{userId:owner,requestUrl:request.url,body:protectedBody,session} satisfies DraftJobInput);
    }catch(error){preparationError ||= error;}});
    // Settle every copy before cleanup or admission, including after one
    // preparation fails. Concurrent copies remain streamed, never buffered.
    if(preparationError)throw preparationError;
    const planRow=await runtime.DB.prepare("SELECT plan_key FROM account_plans WHERE user_id=?").bind(owner).first<{plan_key:string}>();
    const plan=planFor(planRow?.plan_key,isOwner(user));
    if(prepared.length){
      // Four durable creation lanes per submission. Later members are already
      // admitted, but wait server-side for the preceding job in their lane.
      prepared.forEach((item,index)=>{if(index>=4)item.job.dependencyKey=prepared[index-4].key;});
      await runtime.DB.prepare(claimDraftGroupSql(plan.key)).bind(JSON.stringify(prepared.map(({key,batchId,clientId,job})=>({key,batchId,clientId,job}))),owner,plan.drafts).all();
      // Adopt winners from overlapping submissions, never dispatch our losing
      // copies or replace a running request's immutable identity.
      await runBounded(prepared,4,async item=>{
        const row=await lookup(item.key,owner);
        if(!row||row.status==="failed")throw Error(`Your ${plan.name} plan does not have room for this whole submission.`);
        const job=pendingDraftJob(row.response_json);if(job)existing.push({key:item.key,job});
        return item;
      });
    }
    if(existing.length)await runtime.DRAFT_CREATION.createBatch(existing.map(({key,job})=>({id:job.workflowId,params:{key,owner}})));
    await cleanup();
    return NextResponse.json({status:"running",accepted:requests.length},{status:202});
  }catch(error){
    await cleanup();
    return NextResponse.json({error:error instanceof Error?error.message:"The submission could not be queued. Resume this batch to check its saved jobs."},{status:400});
  }
}
export const GET=withErrorLog("printify-drafts",handleGET);
export const POST=withErrorLog("printify-drafts",handlePOST);
