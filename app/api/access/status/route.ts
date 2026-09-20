import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { billingState } from "@/app/billing";
import { mastermindState } from "@/app/mastermind/access";
import { gate } from "@/app/entitlements";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ signedIn: false, active: false });
  const [billing, mastermind, commandCenter] = await Promise.all([
    billingState(user), mastermindState(user), gate(user, "marketWatch"),
  ]);
  return NextResponse.json({
    signedIn: true,
    active: billing.active || mastermind.owner || (mastermind.active && mastermind.redeemed),
    commandCenter: commandCenter.ok,
  });
}
