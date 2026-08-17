"use client";

import { useEffect, useState } from "react";

function remaining(expiresAt:string){
  const normalized=expiresAt.includes("T")?expiresAt:`${expiresAt.replace(" ","T")}Z`;
  const total=Math.max(0,new Date(normalized).getTime()-Date.now());
  const hours=Math.floor(total/3_600_000),minutes=Math.floor(total%3_600_000/60_000),seconds=Math.floor(total%60_000/1000);
  return {total,label:`${String(hours).padStart(2,"0")}:${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}`};
}

export default function BetaCountdown({expiresAt}:{expiresAt:string|null}){
  const [time,setTime]=useState(()=>expiresAt?remaining(expiresAt):null);
  useEffect(()=>{if(!expiresAt)return;const update=()=>{const next=remaining(expiresAt);setTime(next);if(next.total===0)window.location.reload()};update();const timer=window.setInterval(update,1000);return()=>window.clearInterval(timer)},[expiresAt]);
  if(!expiresAt||!time)return null;
  return <aside className="beta-countdown" aria-live="polite"><span>MASTERMIND BETA</span><b>{time.label}</b><small>remaining</small></aside>;
}
