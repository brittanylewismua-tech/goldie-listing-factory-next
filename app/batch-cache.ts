// The design files for a batch, kept in the browser so a batch can be resumed.
//
// Two things this has to survive. The store grew without bound - eighteen
// batches and 68MB on her machine from a few weeks of testing, and a customer
// running twenty-design batches puts 40MB in here each time. And when a browser
// finally refuses a write, saveBatchFiles used to reject into three awaited call
// sites that had no catch, so a full disk would have surfaced as autosave,
// save-as-draft and batch creation all breaking at once.
//
// So: keep only the most recent batches, and never throw. A batch that cannot be
// cached is still a working batch - it just cannot be resumed on this machine.

const DB_NAME="goldie-listing-factory";
const STORE="batch-files";
const KEEP_RECENT=12;

type Entry={files:File[];savedAt:number};

function openDb(){return new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE)};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}

// Entries written before this carried a bare array with no timestamp.
function readEntry(value:unknown):Entry|null{
  if(Array.isArray(value))return {files:value as File[],savedAt:0};
  if(value&&typeof value==="object"&&Array.isArray((value as Entry).files))return value as Entry;
  return null;
}

async function put(database:IDBDatabase,batchId:string,entry:Entry){
  await new Promise<void>((resolve,reject)=>{const tx=database.transaction(STORE,"readwrite");tx.objectStore(STORE).put(entry,batchId);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});
}

async function pruneOldest(database:IDBDatabase,keep:number){
  const store=()=>database.transaction(STORE,"readonly").objectStore(STORE);
  const keys=await new Promise<IDBValidKey[]>(resolve=>{const request=store().getAllKeys();request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>resolve([])});
  if(keys.length<=keep)return;
  const values=await new Promise<unknown[]>(resolve=>{const request=store().getAll();request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>resolve([])});
  const dated=keys.map((key,index)=>({key,savedAt:readEntry(values[index])?.savedAt??0}))
    .sort((a,b)=>b.savedAt-a.savedAt);
  const doomed=dated.slice(keep);
  if(!doomed.length)return;
  await new Promise<void>(resolve=>{
    const tx=database.transaction(STORE,"readwrite");
    for(const item of doomed)tx.objectStore(STORE).delete(item.key);
    tx.oncomplete=()=>resolve();tx.onerror=()=>resolve();
  });
}

/** Returns false when this batch could not be cached; never throws. */
export async function saveBatchFiles(batchId:string,files:File[]):Promise<boolean>{
  let database:IDBDatabase|null=null;
  try{
    database=await openDb();
    const entry:Entry={files,savedAt:Date.now()};
    try{
      await put(database,batchId,entry);
    }catch{
      // Almost always the quota. Make room for the batch in front of her and
      // try once more rather than failing the save she is watching.
      await pruneOldest(database,Math.floor(KEEP_RECENT/3));
      await put(database,batchId,entry);
    }
    await pruneOldest(database,KEEP_RECENT);
    return true;
  }catch{
    return false;
  }finally{ database?.close() }
}

export async function loadBatchFiles(batchId:string):Promise<File[]>{
  let database:IDBDatabase|null=null;
  try{
    database=await openDb();
    const value=await new Promise<unknown>((resolve,reject)=>{const request=database!.transaction(STORE).objectStore(STORE).get(batchId);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
    return readEntry(value)?.files??[];
  }catch{
    return [];
  }finally{ database?.close() }
}

export async function clearBatchFiles(batchId:string){
  let database:IDBDatabase|null=null;
  try{
    database=await openDb();
    await new Promise<void>((resolve,reject)=>{const tx=database!.transaction(STORE,"readwrite");tx.objectStore(STORE).delete(batchId);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});
  }catch{/* A cache that will not clear is not worth breaking a batch over. */}
  finally{ database?.close() }
}
