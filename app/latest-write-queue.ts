/** Serialize writes and coalesce work that has not started. A stale response
 * must not replace the user's newer local state. */
export function latestWriteQueue<T>(){
  let latest=0,tail:Promise<unknown>=Promise.resolve();
  return (write:()=>Promise<T>)=>{
    const revision=++latest;
    const result=tail.then(async()=>{
      if(revision!==latest)return {current:false as const};
      try{const value=await write();return {current:revision===latest,value};}
      catch(error){if(revision!==latest)return {current:false as const};throw error;}
    });
    tail=result.catch(()=>undefined);
    return result;
  };
}
