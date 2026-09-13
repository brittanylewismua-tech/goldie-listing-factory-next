import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { withErrorLog } from "@/app/error-log";
import { check } from "@/app/trademark-check";

/**
 * Check a phrase before it goes on a product.
 *
 * No external call, so no quota, no rate limit and no third party who can
 * change their terms. The list is compiled into the worker and the answer is
 * instant, which is what lets this run for cold traffic at no marginal cost.
 */
export const GET = withErrorLog("trademark", async (request: Request) => {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in to check a phrase." }, { status: 401 });

  const phrase = (new URL(request.url).searchParams.get("phrase") ?? "").slice(0, 200);
  return NextResponse.json(check(phrase));
});
