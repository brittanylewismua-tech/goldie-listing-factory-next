"use client";

import { useState } from "react";

export default function MemberBatchRepair({email,batchId}:{email:string;batchId:string}){
  const [status,setStatus]=useState("");
  async function repair(){
    setStatus("Repairing…");
    const response=await fetch("/api/mastermind/member-diagnostic",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,batchId})});
    const result=await response.json().catch(()=>({})) as {error?:string};
    if(!response.ok){setStatus(result.error||"The batch could not be repaired.");return;}
    window.location.reload();
  }
  return <div><button type="button" onClick={()=>void repair()} disabled={status==="Repairing…"}>Mark verified drafts complete</button>{status&&<p role="status">{status}</p>}</div>;
}
