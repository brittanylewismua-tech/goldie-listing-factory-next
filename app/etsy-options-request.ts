// Taxonomy lookup is read-only even though its filter is sent with POST.
// Retry transient edge failures, but never show an HTML error page as JSON.
export async function requestEtsyOptions(body:unknown,request:typeof fetch=fetch,pause:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
  for(let attempt=0;attempt<3;attempt++){
    const response=await request("/api/etsy/taxonomy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const transient=response.status===429||response.status>=500;
    if(transient&&attempt<2){await response.body?.cancel();await pause(500*(attempt+1));continue}
    const payload=await response.json().catch(()=>null);
    if(!response.ok||!payload?.selected)throw new Error(payload?.error||"Etsy details are temporarily unavailable. Your work is saved; try this listing again.");
    return payload;
  }
}
