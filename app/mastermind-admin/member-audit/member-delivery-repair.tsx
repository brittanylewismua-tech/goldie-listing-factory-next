"use client";

import { useState } from "react";

export default function MemberDeliveryRepair({email,deliveryIds}:{email:string;deliveryIds:string[]}){
  const [status,setStatus]=useState("");
  async function repair(){
    setStatus(`Starting ${deliveryIds.length} verified checks…`);
    const response=await fetch("/api/mastermind/member-diagnostic",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,action:"retry_verified_deliveries",deliveryIds})});
    const result=await response.json().catch(()=>({})) as {error?:string;started?:number};
    if(!response.ok){setStatus(result.error||"The saved checks could not be resumed.");return;}
    setStatus(`${result.started||0} checks resumed. Refresh to see their progress.`);
    window.location.reload();
  }
  return <div><button type="button" onClick={()=>void repair()} disabled={status.startsWith("Starting")}>Resume {deliveryIds.length} verified Etsy drafts</button>{status&&<p role="status">{status}</p>}</div>;
}
