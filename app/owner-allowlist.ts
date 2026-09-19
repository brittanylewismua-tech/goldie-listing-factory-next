import type { ChatGPTUser } from "@/app/chatgpt-auth";

/**
 * WHO THE OWNER IS.
 *
 * Its own module because access.ts imports the Cloudflare runtime, and a pure
 * decision about identity should not be reachable only from inside a worker.
 * That is the third time in this pass that the code most worth running
 * directly was the code that could not be run at all — the log scrubber and
 * the connection-cleanup rules were the others.
 */
/*
  D1722 · An unverified address is not an identity.

  Owner is an allowlist of addresses rather than a flag anyone could write,
  which is the right shape — but it means the boundary is only as good as the
  claim that the address belongs to the person holding the session. An
  unconfirmed email is not that claim.
*/
export function isOwner(user: ChatGPTUser) {
  if (!user.emailVerified) return false;
  return ["beawolfbiz@gmail.com", "brittany@beawolfbiz.com", "goldie@beawolfbiz.com", "brittanylewismua@gmail.com", "shesawolfclothing@gmail.com"].includes(user.email.trim().toLowerCase());
}
