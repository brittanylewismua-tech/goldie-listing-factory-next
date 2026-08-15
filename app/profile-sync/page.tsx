"use client";
import {useEffect,useState} from "react";

export default function ProfileSyncInspection(){
  const [result,setResult]=useState<unknown>({loading:true});
  useEffect(()=>{void fetch("/api/printify?shippingProfiles=1").then(async response=>setResult(await response.json())).catch(error=>setResult({error:error instanceof Error?error.message:"Profile inspection failed."}))},[]);
  return <main style={{padding:24,color:"white",background:"#15120d",minHeight:"100vh"}}><h1>Printify profile sync inspection</h1><pre style={{whiteSpace:"pre-wrap"}}>{JSON.stringify(result,null,2)}</pre></main>
}
