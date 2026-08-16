import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { etsyConnection, etsyFetch } from "../client";

type Money={amount:number;divisor:number;currency_code:string};
type Destination={destination_country_iso?:string|null;destination_region?:string|null;primary_cost?:Money;secondary_cost?:Money;shipping_carrier_id?:number;mail_class?:string;min_delivery_days?:number;max_delivery_days?:number};
type Profile={shipping_profile_id:number;title:string;origin_country_iso:string;origin_postal_code?:string;is_deleted?:boolean;shipping_profile_destinations?:Destination[]};
const amount=(money?:Money)=>money?.divisor?money.amount/money.divisor:0;

export async function GET(){
  const user=await getChatGPTUser();
  if(!user)return NextResponse.json({error:"Sign in before loading Etsy shipping profiles."},{status:401});
  try{
    const connection=await etsyConnection(user.userId);
    const payload=await etsyFetch<{results?:Profile[]}>(`/shops/${connection.shopId}/shipping-profiles`,connection.token);
    const profiles=(payload.results||[]).filter(profile=>!profile.is_deleted).map(profile=>{
      const destinations=profile.shipping_profile_destinations||[];
      const domestic=destinations.find(item=>item.destination_country_iso===profile.origin_country_iso);
      const international=destinations.filter(item=>item!==domestic);
      return {id:profile.shipping_profile_id,title:profile.title,originCountry:profile.origin_country_iso,currency:domestic?.primary_cost?.currency_code||international[0]?.primary_cost?.currency_code||"USD",domesticPrimary:amount(domestic?.primary_cost),domesticAdditional:amount(domestic?.secondary_cost),international:international.map(item=>({key:item.destination_country_iso?`country:${item.destination_country_iso}`:`region:${item.destination_region||"International"}`,label:item.destination_country_iso||item.destination_region||"International",primary:amount(item.primary_cost),additional:amount(item.secondary_cost)}))};
    });
    return NextResponse.json({profiles,shopName:connection.shopName});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Etsy shipping profiles could not be loaded."},{status:500})}
}

function destinationParams(destination:Destination,primary:number,secondary:number){const params=new URLSearchParams({primary_cost:primary.toFixed(2),secondary_cost:secondary.toFixed(2)});if(destination.destination_country_iso)params.set("destination_country_iso",destination.destination_country_iso);else if(destination.destination_region)params.set("destination_region",destination.destination_region);if(destination.shipping_carrier_id&&destination.mail_class){params.set("shipping_carrier_id",String(destination.shipping_carrier_id));params.set("mail_class",destination.mail_class)}else{params.set("min_delivery_days",String(Math.max(1,Number(destination.min_delivery_days)||1)));params.set("max_delivery_days",String(Math.max(Number(destination.min_delivery_days)||1,Number(destination.max_delivery_days)||10)))}return params}

export async function POST(request:Request){
  const user=await getChatGPTUser();if(!user)return NextResponse.json({error:"Sign in before creating an Etsy shipping profile."},{status:401});
  try{
    const {baseProfileId,domesticPrimary,domesticAdditional,international,title:requestedTitle}=await request.json() as {baseProfileId?:number;domesticPrimary?:number;domesticAdditional?:number;international?:Array<{key:string;primary:number;additional:number}>;title?:string},charge=Number(domesticPrimary),additional=Number(domesticAdditional),customTitle=String(requestedTitle||"").trim().slice(0,60);
    if(!Number.isInteger(Number(baseProfileId))||Number(baseProfileId)<=0||!Number.isFinite(charge)||charge<0||!Number.isFinite(additional)||additional<0||!customTitle)return NextResponse.json({error:"Name the profile and enter valid first-item and additional-item domestic charges."},{status:400});
    const connection=await etsyConnection(user.userId),base=await etsyFetch<Profile>(`/shops/${connection.shopId}/shipping-profiles/${Number(baseProfileId)}`,connection.token),destinations=base.shipping_profile_destinations||[],domestic=destinations.find(item=>item.destination_country_iso===base.origin_country_iso),submitted=new Map((international||[]).map(rate=>[String(rate.key),rate]));
    if(!domestic)throw new Error("The selected Etsy profile does not contain a domestic destination Goldie can safely copy.");
    const title=customTitle,create=destinationParams(domestic,charge,additional);create.set("title",title);create.set("origin_country_iso",base.origin_country_iso);if(base.origin_postal_code)create.set("origin_postal_code",base.origin_postal_code);
    const saved=await etsyFetch<Profile>(`/shops/${connection.shopId}/shipping-profiles`,connection.token,{method:"POST",body:create});
    for(const destination of destinations.filter(item=>item!==domestic)){const key=destination.destination_country_iso?`country:${destination.destination_country_iso}`:`region:${destination.destination_region||"International"}`,edited=submitted.get(key),primary=Number(edited?.primary),secondary=Number(edited?.additional);if(!edited||!Number.isFinite(primary)||primary<0||!Number.isFinite(secondary)||secondary<0)throw new Error(`Enter valid first-item and additional-item shipping for ${destination.destination_country_iso||destination.destination_region||"every international destination"}.`);const params=destinationParams(destination,primary,secondary);await etsyFetch(`/shops/${connection.shopId}/shipping-profiles/${saved.shipping_profile_id}/destinations`,connection.token,{method:"POST",body:params});await new Promise(resolve=>setTimeout(resolve,250))}
    return NextResponse.json({id:saved.shipping_profile_id,title});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"The Etsy shipping profile could not be created."},{status:500})}
}
