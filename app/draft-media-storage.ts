/** Private, immutable mockup metadata. D1 retains the ownership/search fields;
 * large repeated URL arrays belong in object storage, not every SQL row. */
export const DRAFT_MEDIA_FIELDS=['printifyImages','printifyImageDetails','colorPreviewImageDetails'] as const;
export const DRAFT_OBJECT_FIELDS=['primaryArtworkAreas','costReview','etsyDetails'] as const;
export const DRAFT_STORAGE_FIELDS=[...DRAFT_MEDIA_FIELDS,...DRAFT_OBJECT_FIELDS] as const;
type JsonRecord=Record<string,unknown>;
export type MediaBucket={
  put(key:string,value:Uint8Array,options?:{httpMetadata?:{contentType?:string};customMetadata?:Record<string,string>}):Promise<unknown>;
  get(key:string):Promise<{arrayBuffer():Promise<ArrayBuffer>;customMetadata?:Record<string,string>}|null>;
};
type MediaPointer={version:1;key:string;sha256:string};
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
const digest=async(bytes:Uint8Array)=>hex(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes)));
const prefix=(owner:string,id:string)=>`draft-media/${encodeURIComponent(owner)}/${encodeURIComponent(id)}/`;

export async function packDraftMedia<T extends JsonRecord>(draft:T,owner:string,bucket:MediaBucket):Promise<JsonRecord>{
  if(!owner||typeof draft.id!=='string'||!draft.id)throw new Error('Draft media needs an owned product identity.');
  const media:JsonRecord={};
  for(const field of DRAFT_STORAGE_FIELDS)if(draft[field]&&typeof draft[field]==='object')media[field]=draft[field];
  if(!Object.keys(media).length)return {...draft};
  const bytes=new TextEncoder().encode(JSON.stringify(media));
  // Small creation responses remain inline; no R2 read is added to that path.
  if(bytes.byteLength<8192)return {...draft};
  const sha256=await digest(bytes),key=`${prefix(owner,draft.id)}${sha256}.json.gz`;
  const compressed=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  await bucket.put(key,compressed,{httpMetadata:{contentType:'application/gzip'},customMetadata:{owner,productId:draft.id,sha256}});
  const stored:JsonRecord={...draft,_draftMedia:{version:1,key,sha256} satisfies MediaPointer};
  for(const field of DRAFT_STORAGE_FIELDS)delete stored[field];
  return stored;
}

export async function unpackDraftMedia<T extends JsonRecord=JsonRecord>(value:string|JsonRecord,owner:string,bucket:MediaBucket):Promise<T>{
  const stored=typeof value==='string'?JSON.parse(value) as JsonRecord:value;
  if(!stored._draftMedia)return {...stored} as T;
  const pointer=stored._draftMedia as MediaPointer,id=String(stored.id||'');
  if(pointer.version!==1||!id||!owner||!/^[a-f0-9]{64}$/.test(pointer.sha256)||pointer.key!==`${prefix(owner,id)}${pointer.sha256}.json.gz`)throw new Error('Draft media ownership could not be verified.');
  const object=await bucket.get(pointer.key);
  if(!object||object.customMetadata?.owner!==owner||object.customMetadata?.productId!==id||object.customMetadata?.sha256!==pointer.sha256)throw new Error('Saved mockup metadata could not be loaded. Retry loading this batch.');
  const bytes=new Uint8Array(await new Response(new Blob([await object.arrayBuffer()]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  if(await digest(bytes)!==pointer.sha256)throw new Error('Saved mockup metadata failed its integrity check.');
  const media=JSON.parse(new TextDecoder().decode(bytes)) as JsonRecord,restored:JsonRecord={...stored};
  delete restored._draftMedia;
  for(const field of DRAFT_STORAGE_FIELDS)if(media[field]&&typeof media[field]==='object')restored[field]=media[field];
  return restored as T;
}

const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const record=(value:unknown):value is JsonRecord=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
/** Apply only this request's changes. Unchanged fields cannot overwrite newer
 * concurrent saves. Arrays are atomic because their order/variant indices matter. */
export function mergeDraftChanges(before:JsonRecord,after:JsonRecord,current:JsonRecord):JsonRecord{
  const merged={...current};
  // A slow gallery refresh can finish after an artwork replacement. Its media
  // was generated for the old artwork; do not roll back the newer preview.
  const newerArtwork=Number(current.artworkPreviewRevision||0)>Number(before.artworkPreviewRevision||0);
  const changesArtwork=!equal(before.artworkPreviewRevision,after.artworkPreviewRevision);
  for(const key of new Set([...Object.keys(before),...Object.keys(after)])){
    if(key==='_draftMedia'||equal(before[key],after[key]))continue;
    if(newerArtwork&&!changesArtwork&&(['previewUrl',...DRAFT_MEDIA_FIELDS] as readonly string[]).includes(key))continue;
    if(!Object.prototype.hasOwnProperty.call(after,key)){delete merged[key];continue;}
    merged[key]=record(before[key])&&record(after[key])&&record(current[key])?mergeDraftChanges(before[key],after[key],current[key]):after[key];
  }
  return merged;
}

export async function saveDraftChanges(options:{before:JsonRecord;after:JsonRecord;owner:string;bucket:MediaBucket;read:()=>Promise<string|null>;compareAndSwap:(previous:string,next:string)=>Promise<boolean>}){
  if(!options.before.id||options.before.id!==options.after.id||options.before.clientId!==options.after.clientId)throw new Error('Draft identity changed during saving.');
  for(let attempt=0;attempt<5;attempt++){
    const previous=await options.read();if(!previous)throw new Error('The owned draft could not be found.');
    const current=await unpackDraftMedia(previous,options.owner,options.bucket);
    if(current.id!==options.before.id||current.clientId!==options.before.clientId)throw new Error('Draft identity changed during saving.');
    const merged=mergeDraftChanges(options.before,options.after,current);
    const packed=await packDraftMedia(merged,options.owner,options.bucket);
    if(await options.compareAndSwap(previous,JSON.stringify(packed)))return merged;
  }
  throw new Error('Another update is still saving. Retry saving this change.');
}
