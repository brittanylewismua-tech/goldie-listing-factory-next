/** The SQL row is the durable admission record. Keep pending job data private in
 * R2; never put credentials or artwork bytes in Workflow parameters. */
export type PendingDraftJob={version:1;inputKey:string;workflowId:string;phase:'queued'|'uploaded'|'creating'|'created';uploadKey?:string;productKey?:string;error?:string;dependencyKey?:string};
/** A reconciliation-only job no longer occupies a creation slot, but keeps its
 * quota reservation. Never confuse this with permission to retry its POST. */
export function draftCreationSlotReleased(status:string){return ['succeeded','failed','uncertain'].includes(status);}
export const CLAIM_DRAFT_JOB_SQL=`INSERT INTO printify_draft_results
  (request_key,user_id,batch_id,client_id,status,response_json,updated_at)
  SELECT ?1,?2,?3,?4,'running',?6,CURRENT_TIMESTAMP
  WHERE (SELECT COUNT(*) FROM printify_draft_results WHERE user_id=?2
    AND (status IN ('running','uncertain') OR (status='succeeded' AND COALESCE(created_at,updated_at)>=datetime('now','start of month')))) < ?5
  ON CONFLICT(request_key) DO UPDATE SET status='running',response_json=excluded.response_json,updated_at=CURRENT_TIMESTAMP
  WHERE printify_draft_results.user_id=excluded.user_id AND printify_draft_results.status='failed'
  RETURNING request_key`;
/** Reserve a complete submission in one statement. A competing submission
 * cannot consume half the allowance and leave this submission half-admitted. */
export const CLAIM_DRAFT_GROUP_SQL=`WITH incoming AS (
  SELECT json_extract(value,'$.key') AS request_key,
    json_extract(value,'$.batchId') AS batch_id,
    json_extract(value,'$.clientId') AS client_id,
    json_extract(value,'$.job') AS response_json FROM json_each(?1)
), needed AS (
  SELECT * FROM incoming WHERE NOT EXISTS (
    SELECT 1 FROM printify_draft_results r WHERE r.request_key=incoming.request_key AND r.status!='failed'
  )
)
INSERT INTO printify_draft_results(request_key,user_id,batch_id,client_id,status,response_json,updated_at)
SELECT request_key,?2,batch_id,client_id,'running',response_json,CURRENT_TIMESTAMP FROM needed
WHERE (SELECT COUNT(*) FROM printify_draft_results WHERE user_id=?2
  AND (status IN ('running','uncertain') OR (status='succeeded' AND COALESCE(created_at,updated_at)>=datetime('now','start of month'))))
  +(SELECT COUNT(*) FROM needed)<=?3
ON CONFLICT(request_key) DO UPDATE SET status='running',response_json=excluded.response_json,updated_at=CURRENT_TIMESTAMP
WHERE printify_draft_results.user_id=excluded.user_id AND printify_draft_results.status='failed'
RETURNING request_key`;
export function pendingDraftJob(value:string|null):PendingDraftJob|null{
  if(!value)return null;
  try{const data=JSON.parse(value);return data?.version===1&&typeof data.inputKey==='string'&&typeof data.workflowId==='string'&&['queued','uploaded','creating','created'].includes(data.phase)?data:null;}catch{return null;}
}
export const jobObjectPrefix=(owner:string,workflowId:string)=>`draft-jobs/${encodeURIComponent(owner)}/${encodeURIComponent(workflowId)}/`;
/** Only disposable execution checkpoints are removed, and only after the
 * canonical successful result is persisted. Saved artwork/media live elsewhere. */
export async function cleanupCompletedDraftJob(bucket:{list(options:{prefix:string;limit:number}):Promise<{objects:Array<{key:string}>;truncated:boolean}>;delete(keys:string[]):Promise<void>},owner:string,workflowId:string){
  const prefix=jobObjectPrefix(owner,workflowId);
  const page=await bucket.list({prefix,limit:100});
  const keys=page.objects.map(object=>object.key).filter(key=>key.startsWith(prefix));
  if(keys.length)await bucket.delete(keys);
  if(page.truncated)throw Error('More execution checkpoints remain to clean up.');
}
export type JobBucket={put(key:string,value:Uint8Array,options?:{customMetadata?:Record<string,string>;httpMetadata?:{contentType?:string}}):Promise<unknown>;get(key:string):Promise<{arrayBuffer():Promise<ArrayBuffer>;body?:ReadableStream;customMetadata?:Record<string,string>}|null>};
export async function writeJobObject(bucket:JobBucket,owner:string,workflowId:string,name:string,value:unknown){
  if(!/^[a-z-]+\.json$/.test(name))throw Error('Invalid job checkpoint name.');
  const key=jobObjectPrefix(owner,workflowId)+name;
  await bucket.put(key,new TextEncoder().encode(JSON.stringify(value)),{customMetadata:{owner,workflowId},httpMetadata:{contentType:'application/json'}});
  return key;
}
export async function readJobObject<T>(bucket:JobBucket,owner:string,workflowId:string,key:string):Promise<T>{
  if(!key.startsWith(jobObjectPrefix(owner,workflowId)))throw Error('Invalid job checkpoint owner.');
  const object=await bucket.get(key);
  if(!object||object.customMetadata?.owner!==owner||object.customMetadata?.workflowId!==workflowId)throw Error('The protected draft checkpoint could not be loaded.');
  return JSON.parse(new TextDecoder().decode(await object.arrayBuffer())) as T;
}
