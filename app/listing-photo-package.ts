export type PackagePhoto={id:string;key?:string;src?:string;kind:"printify"|"photo"|"size-guide"};
/** Match the editor's membership and ordering; never trust stored order as a source of file paths. */
export function orderedPackagePhotos(images:string[],indices:number[],objects:{key:string}[],prefix:string,saved:unknown):PackagePhoto[]{
  const stored=objects.filter(o=>o.key.startsWith(prefix)&&/^(mockup|upload|size-guide)\//.test(o.key.slice(prefix.length))).map(o=>({id:`stored:${o.key}`,key:o.key,kind:o.key.includes('/size-guide/')?'size-guide' as const:'photo' as const}));
  const printify=[...new Set(indices)].filter(i=>Number.isInteger(i)&&i>=0&&Boolean(images[i])).map(i=>({id:`printify:${i}`,src:images[i],kind:'printify' as const}));
  const available:PackagePhoto[]=[...stored.filter(p=>p.kind!=='size-guide'),...printify,...stored.filter(p=>p.kind==='size-guide')];
  const byId=new Map(available.map(p=>[p.id,p]));
  return [...new Set([...(Array.isArray(saved)?saved.filter((id):id is string=>typeof id==='string'):[]),...byId.keys()])].flatMap(id=>byId.has(id)?[byId.get(id)!]:[]);
}
export async function loadPhotoPackage(photos:PackagePhoto[],load:(photo:PackagePhoto)=>Promise<{bytes:Uint8Array;extension:string}>,maxBytes=90*1024*1024){
  const files:Record<string,Uint8Array>={};let total=0;
  for(const [index,photo] of photos.entries()){
    // A failed image must fail the whole download, never silently omit a buyer-facing photo.
    const result=await load(photo);total+=result.bytes.byteLength;
    if(total>maxBytes)throw new Error('These photos are too large to package together. Download fewer photos, then try again.');
    files[`${String(index+1).padStart(2,'0')}-${photo.kind}.${result.extension}`]=result.bytes;
  }
  return files;
}
