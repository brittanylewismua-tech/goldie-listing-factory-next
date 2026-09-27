import { NextResponse } from "next/server";
import { safeReturnPath } from "@/app/safe-return-path";

const MIRRORBOT_ORIGIN = "https://goldie-listing-factory-next.brittany-lewis.chatgpt.site";

/**
 * Supabase already permits the Goldie custom domain. Receive its Google or
 * email-link callback here, then return the code to the Sites origin where
 * the PKCE verifier cookie was created.
 */
export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const returnTo = safeReturnPath(incoming.searchParams.get("return_to"), "/mirrorbot");
  const destination = new URL("/auth/callback", MIRRORBOT_ORIGIN);
  const code = incoming.searchParams.get("code");
  if (code) destination.searchParams.set("code", code);
  destination.searchParams.set("return_to", returnTo);
  return NextResponse.redirect(destination, 303);
}
