import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { billingState } from "@/app/billing";
import { mastermindState } from "@/app/mastermind/access";

// These two switches intentionally live in source control. Customer access
// cannot be enabled by changing the Site's sharing setting alone.
export const CUSTOMER_LAUNCH_ENABLED = false;
export const SECURE_URL_UPLOAD_IMPLEMENTED = true;

export async function customerLaunchBlock(user: ChatGPTUser) {
  const [state,billing] = await Promise.all([mastermindState(user),billingState(user)]);
  if (state.owner || billing.active || (state.active && state.redeemed && SECURE_URL_UPLOAD_IMPLEMENTED)) return null;
  if (CUSTOMER_LAUNCH_ENABLED) return null;
  return "Choose a Listing Factory subscription before using the Listing Factory.";
}
