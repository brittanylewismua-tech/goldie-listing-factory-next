"use client";
import { useEffect } from "react";

export default function ReliableNavigation(){
  useEffect(()=>{
    const navigate=(event:MouseEvent)=>{
      if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      const target=event.target instanceof Element?event.target.closest("a[href]"):null;
      if(!(target instanceof HTMLAnchorElement)||target.target||target.hasAttribute("download"))return;
      const url=new URL(target.href,window.location.href);
      if(url.origin!==window.location.origin)return;
      event.preventDefault();event.stopImmediatePropagation();window.location.assign(url.href);
    };
    document.addEventListener("click",navigate,true);
    return()=>document.removeEventListener("click",navigate,true);
  },[]);
  return null;
}
