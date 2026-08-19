import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/supabase-auth";

export async function GET(request: Request) {
  await (await createSupabaseServerClient()).auth.signOut().catch(() => undefined);
  const url = new URL(request.url);
  const candidate = url.searchParams.get("return_to") || "/";
  const returnTo = candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/listing-factory";
  return NextResponse.redirect(new URL(`/signout-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`, url.origin));
}
