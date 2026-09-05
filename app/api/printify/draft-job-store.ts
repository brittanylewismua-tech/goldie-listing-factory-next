/** The SQL row is the durable admission record. Keep pending job data private in
 * R2; never put credentials or artwork bytes in Workflow parameters. */
export type PendingDraftJob={version:1;inputKey:string;workflowId:string;phase:'queued'|'uploaded'|'creating'|'created';uploadKey?:string;productKey?:string;error?:string};
export const CLAIM_DRAFT_JOB_SQL=`INSERT INTO printify_draft_results
  (request_key,user_id,batch_id,client_id,status,response_json,updated_at)
  SELECT ?1,?2,?3,?4,'running',?6,CURRENT_TIMESTAMP
  WHERE (SELECT COUNT(*) FROM printify_draft_results WHERE user_id=?2
    AND (status IN ('running','uncertain') OR (status='succeeded' AND COALESCE(created_at,updated_at)>=datetime('now','start of month')))) < ?5
  ON CONFLICT(request_key) DO UPDATE SET status='running',response_json=excluded.response_json,updated_at=CURRENT_TIMESTAMP
  WHERE printify_draft_results.user_id=excluded.user_id AND printify_draft_results.status='failed'
  RETURNING request_key`;
export function pendingDraftJob(value:string|null):PendingDraftJob|null{
  if(!value)return null;
  try{const data=JSON.parse(value);return data?.version===1&&typeof data.inputKey==='string'&&typeof data.workflowId==='string'&&['queued','uploaded','creating','created'].includes(data.phase)?data:null;}catch{return null;}
}
export const jobObjectPrefix=(owner:string,workflowId:string)=>`draft-jobs/${encodeURIComponent(owner)}/${encodeURIComponent(workflowId)}/`;
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
