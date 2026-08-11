import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { mastermindState } from "@/app/mastermind/access";

// These two switches intentionally live in source control. Customer access
// cannot be enabled by changing the Site's sharing setting alone.
export const CUSTOMER_LAUNCH_ENABLED = false;
export const SECURE_URL_UPLOAD_IMPLEMENTED = true;

export async function customerLaunchBlock(user: ChatGPTUser) {
  const state = await mastermindState(user);
  if (state.owner || (state.active && state.redeemed && SECURE_URL_UPLOAD_IMPLEMENTED)) return null;
  if (!state.active) return "Mastermind access is currently closed.";
  if (!state.redeemed) return "Enter the mastermind access code before using the Listing Factory.";
  return CUSTOMER_LAUNCH_ENABLED ? null : "Goldie Listing Factory access is unavailable.";
}
