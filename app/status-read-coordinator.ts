/** One in-flight status read; obsolete replies and errors cannot overwrite a newer action. */
export function statusReadCoordinator<T>(){
 let revision=0,active:{key:string;controller:AbortController;promise:Promise<void>}|null=null;
 const invalidate=()=>{revision++;active?.controller.abort();active=null};
 return {invalidate,run(key:string,read:(signal:AbortSignal)=>Promise<T>,apply:(value:T)=>void):Promise<void>{
  if(active?.key===key)return active.promise;
  invalidate();const current=revision,controller=new AbortController();
  const promise=(async()=>{try{const result=await read(controller.signal);if(current===revision)apply(result)}catch(error){if(current===revision)throw error}finally{if(active?.controller===controller)active=null}})();
  active={key,controller,promise};return promise;
 }};
}
