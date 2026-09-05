import {DRAFT_STORAGE_FIELDS,type MediaBucket} from './draft-media-storage.ts';
type RecordValue=Record<string,unknown>;
type Identity={id:string;clientId:string};
const fingerprint=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes))),b=>b.toString(16).padStart(2,'0')).join('');
const prefix=(owner:string)=>`batch-templates/${encodeURIComponent(owner)}/`;

/** SQL keeps the small history/resume index. Full template data is immutable
 * private object data; canonical owned drafts already keep their own media. */
export async function packBatchSnapshot(state:RecordValue,owner:string,bucket:MediaBucket,ownedDrafts:Identity[]):Promise<RecordValue>{
  const packed={...state};
  if(Array.isArray(state.drafts))packed.drafts=state.drafts.map(value=>{
    const draft=value as RecordValue;
    if(!ownedDrafts.some(owned=>owned.id===draft.id&&owned.clientId===draft.clientId))return draft;
    const copy={...draft};for(const field of DRAFT_STORAGE_FIELDS)delete copy[field];return copy;
  });
  const template=state.templateDetails as RecordValue|undefined;
  if(!template||typeof template!=='object'||Array.isArray(template))return packed;
  const bytes=new TextEncoder().encode(JSON.stringify(template));
  if(bytes.length<8192)return packed;
  const sha256=await fingerprint(bytes),key=`${prefix(owner)}${sha256}.json.gz`;
  const compressed=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  await bucket.put(key,compressed,{httpMetadata:{contentType:'application/gzip'},customMetadata:{owner,sha256}});
  const summary:RecordValue={};
  for(const field of ['id','batchId','previewImage','blueprintTitle'])if(field in template)summary[field]=template[field];
  if(!summary.previewImage&&Array.isArray(template.previewImages))summary.previewImage=template.previewImages.find(Boolean);
  return {...packed,templateDetails:summary,_templateDetails:{version:1,key,sha256}};
}

export async function unpackBatchSnapshot(state:RecordValue,owner:string,bucket:MediaBucket):Promise<RecordValue>{
  const pointer=state._templateDetails as {version:number;key:string;sha256:string}|undefined;
  if(!pointer)return state;
  if(pointer.version!==1||!/^[a-f0-9]{64}$/.test(pointer.sha256)||pointer.key!==`${prefix(owner)}${pointer.sha256}.json.gz`)throw Error('Saved product template ownership could not be verified.');
  const object=await bucket.get(pointer.key);
  if(!object||object.customMetadata?.owner!==owner||object.customMetadata?.sha256!==pointer.sha256)throw Error('Saved product template could not be loaded.');
  const bytes=new Uint8Array(await new Response(new Blob([await object.arrayBuffer()]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  if(await fingerprint(bytes)!==pointer.sha256)throw Error('Saved product template failed its integrity check.');
  const restored:RecordValue={...state,templateDetails:JSON.parse(new TextDecoder().decode(bytes))};delete restored._templateDetails;return restored;
}
