import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/supabase-auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const candidate = url.searchParams.get("return_to") || "/listing-factory";
  const returnTo = candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/listing-factory";
  if (code) {
    const { error } = await (await createSupabaseServerClient()).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(returnTo, url.origin));
  }
  return NextResponse.redirect(new URL(`/account/sign-in?return_to=${encodeURIComponent(returnTo)}&error=signin`, url.origin));
}
