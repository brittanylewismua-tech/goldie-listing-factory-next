"use client";
import { useEffect, useState } from "react";
import { BUILD_MARKER } from "./build-marker";

/* D542 - measured on her own page, and it explains a week of arguments. Her tab
   was still running D539 while /api/version answered D540: the server had the
   deploy, the tab did not, and nothing on screen said so. So a fix would go out,
   she would look at the page she already had open, see the old behaviour
   unchanged, and reasonably conclude it had not been fixed. The reload that
   would have shown it is invisible - nobody thinks to hard-refresh a page they
   have been working in for six hours.
   The running bundle knows which build it is. Ask the server which build it is
   serving; if they differ, say so and offer the reload. */
export default function NewBuildNotice(){
  const [waiting,setWaiting]=useState("");
  useEffect(()=>{
    let stopped=false;
    const check=async()=>{
      if(stopped||document.visibilityState==="hidden")return;
      try{
        const answer=await fetch("/api/version",{cache:"no-store"}).then(response=>response.ok?response.json():null);
        const live=answer&&typeof answer.build==="string"?answer.build:"";
        if(!stopped&&live&&live!==BUILD_MARKER)setWaiting(live);
      }catch{/* offline, or the deploy is mid-flight - ask again next time */}
    };
    void check();
    const timer=window.setInterval(check,60000);
    document.addEventListener("visibilitychange",check);
    return()=>{stopped=true;window.clearInterval(timer);document.removeEventListener("visibilitychange",check)};
  },[]);
  if(!waiting)return null;
  return <div className="new-build-notice" role="status">
    <div>
      <b>A newer version of Goldie is live.</b>
      <small>This tab is still running {BUILD_MARKER}; {waiting} is deployed. Reload to see the changes — your batch is saved.</small>
    </div>
    <button type="button" onClick={()=>window.location.reload()}>Reload</button>
  </div>;
}
