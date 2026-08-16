import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export async function GET() {
  const user = await getChatGPTUser();
  return NextResponse.json({ signedIn: Boolean(user) });
}
