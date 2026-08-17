import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { billingState } from "@/app/billing";

export async function GET(){const user=await getChatGPTUser();if(!user)return NextResponse.json({signedIn:false,active:false});const state=await billingState(user);return NextResponse.json({signedIn:true,...state});}
