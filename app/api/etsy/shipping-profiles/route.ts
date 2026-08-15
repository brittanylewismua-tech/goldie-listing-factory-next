import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { etsyConnection, etsyFetch } from "../client";

type Money={amount:number;divisor:number;currency_code:string};
type Destination={destination_country_iso?:string|null;destination_region?:string|null;primary_cost?:Money;secondary_cost?:Money};
type Profile={shipping_profile_id:number;title:string;origin_country_iso:string;is_deleted?:boolean;shipping_profile_destinations?:Destination[]};
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
      return {id:profile.shipping_profile_id,title:profile.title,originCountry:profile.origin_country_iso,currency:domestic?.primary_cost?.currency_code||international[0]?.primary_cost?.currency_code||"USD",domesticPrimary:amount(domestic?.primary_cost),domesticAdditional:amount(domestic?.secondary_cost),international:international.map(item=>({label:item.destination_country_iso||item.destination_region||"International",primary:amount(item.primary_cost),additional:amount(item.secondary_cost)}))};
    });
    return NextResponse.json({profiles,shopName:connection.shopName});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Etsy shipping profiles could not be loaded."},{status:500})}
}
