import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { billingState } from "@/app/billing";
import { mastermindState } from "@/app/mastermind/access";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ signedIn: false, active: false });
  const [billing, mastermind] = await Promise.all([billingState(user), mastermindState(user)]);
  return NextResponse.json({
    signedIn: true,
    active: billing.active || mastermind.owner || (mastermind.active && mastermind.redeemed),
  });
}
